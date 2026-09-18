# Architektura automatizovaných API testů - Todoist

## Východiska

Repozitář `tf2026-workshop-api-claude` je prázdný, obsahuje jen dva zadávací dokumenty a nemá žádný commit. Cílem je postavit od nuly samostatné repo s automatizovanými API testy Todoistu, které slouží dvěma účelům současně:

1. **Provozní:** rychlá zpětná vazba, jestli API žije (smoke každou hodinu), a odlehčení manuálním testerům při regresi (denní běh v 16:00).
2. **Workshopový:** je to materiál pro Tesena Fest workshop "AI-assisted API Testing". Asi 12 lidí v párech si bere test casy z připraveného katalogu jako GitHub issues, agent je implementuje, člověk reviewuje PR a mergne.

Ta dvojí role určuje skoro každé rozhodnutí níže. Framework musí být dost jednoduchý, aby ho pár lidí pochopil za dopoledne, a dost robustní, aby snesl 24 běhů denně na reálném produkčním účtu.

**Zdroje zadání v repu:**
- [Zadání architektury API testování todoist.md](Zadání architektury API testování todoist.md) - 15 bodů, co má architektura obsahovat
- [5 - test cases a scope.md](5%20-%20test%20cases%20a%20scope.md) - závazný katalog test casů TC-01 až TC-24, TC-09a a UC-E2E, rozdělený do vln 0-5, včetně pravidla, kde každá vlna končí

**Rozhodnutí uživatele učiněná při plánování:**

| Otázka | Rozhodnutí |
|---|---|
| ID testů | TC-01 až TC-24, TC-09a, UC-E2E z katalogu. Žádný externí TMS, žádná mapovací tabulka |
| Viditelnost repa | **Veřejné.** Sanitizace artefaktů je proto v základním rozsahu, ne follow-up |
| Účty | Každý účastník má vlastní Todoist účet a token lokálně v `.env`. Jeden sdílený servisní účet jen pro CI |
| Dokument architektury | Jde do repa přes Issue → větev → PR, ne přímo do main |
| `temp/todoist-e2e.har` | Uživatel ho má a dodá později. UC-E2E na něm závisí |

---

## Ověřená fakta o Todoist API

Tahle sekce existuje proto, že několik z nich jde proti intuici a testy na nich stojí.

- **Auth:** `Authorization: Bearer <token>`. Personal API token ze Settings → Integrations → Developer, 40 hex znaků, **neexpiruje**. Únik je tedy trvalý, dokud ho někdo ručně neotočí. Neplatný token → 401, `error_code: 477`. **Nikdy neretryovat.**
- **Free plán:** `max_projects: 5`, `max_tasks: 300`, `max_sections: 20`, `max_labels: 500`. `reminders: false`, ale `reminders_at_due: true`.
- **`DELETE /tasks/{id}` je soft delete.** Následný `GET` vrací 200 s `is_deleted: true`, ne 404. Tohle je nejdůležitější odchylka od očekávání a promítá se do asercí, do cleanupu i do kapacitního rozpočtu.
- **Quick Add parser rozumí jen anglicky** bez ohledu na `due_lang`; `/tasks/quick` nemá parametr `lang`.
- **Due dates:** `due.string` je vždy v timezone uživatele. Timezone je nejrizikovější proměnná celé domény.
- **OpenAPI spec** na `https://developer.todoist.com/openapi.json` je veřejný, ale u klíčových polí POST /tasks (`project_id`, `priority`, `due_string`, `due_lang`, `duration`) chybí `type`. Generované typy by byly `unknown`.
- **Rate limity REST API nejsou dokumentované.** Sync API: 1000 partial / 100 full syncs za 15 min. Chováme se defenzivně.

---

## Architektura: čtyři vrstvy

Zadání chce "page object model". V API testech je jeho obdobou **resource object**: page object skrývá selektory a nabízí akce v jazyce uživatele, resource object skrývá cesty, HTTP metody a paginaci a nabízí `tasks.close(id)` místo `POST /tasks/{id}/close`. Stejný princip, jiný typ lokátoru. Tahle věta patří do `docs/architecture.md`, aby nikdo nehledal třídy s názvem `Page`.

```
tests/*.spec.ts          co se testuje a co to znamená pro byznys
    ↓ importuje `test` z fixtures
fixtures/test.ts         co má test k dispozici a co se uklidí
    ↓ drží instance
src/api/resources/*.api  sémantické operace nad resourcem + validace tvaru odpovědi
    ↓ volá
src/api/client.ts        HTTP, auth, timeout, retry, korelační id
```

**Pravidlo hranice v jedné větě: když v testu vidíš lomítko v řetězci, patří to o vrstvu níž.**

### `src/api/client.ts` - jediná HTTP hranice

Dělá: sestaví URL z aktivního base URL, přidá `Authorization` a `X-Request-Id` ve tvaru `<runId>/<TC-id>/<pořadí>`, timeout 20 s (nad 15s limitem API, aby se náš timeout odlišil od jejich), **retry pouze na 429** s respektem k `Retry-After`, max 3 pokusy.

Nedělá: neretryuje 401 (neplatný token, marné) ani 5xx (jinak by suite maskovala regresi), nezná pojmy task/project, neobsahuje žádnou aserci.

Dvě metody: `raw()` vrací `{status, headers, body}` bez vyhazování (pro negativní testy), `send()` vyhodí typovanou chybu na non-2xx.

### `src/api/resources/*.api.ts` - resource objects

Jedna metoda = jedna sémantická operace. Vlastní paginaci (`next_cursor`), takže test kurzor nikdy nevidí. **Validuje odpověď zod schématem** a vrací typovaný objekt. Vystavuje `*Raw()` varianty pro negativní testy.

Validace je tady, ne v testech, protože tím každý test dostane kontrolu tvaru zdarma a přesně jednou. Když Todoist přejmenuje pole, spadne to s jasnou hláškou v jednom místě, ne jako `undefined` v deseti testech.

### `fixtures/test.ts`

Worker-scoped (drahé, jednou na worker): `request`, `env`, `runContext`, `api`, `projects`, `sections`, `tasks`, `comments`, `labels`.

Test-scoped: `testId` (TC číslo z názvu testu), `tracker` (evidence resources, teardown uklidí i po failu), `data` (factory payloadů svázaná s `runId` a `testId`), `workspace` (projekt vytvořený lazy pro tento test).

Fixtures sestavují, poskytují a uklízí. Žádné aserce, žádná byznys logika.

---

## Typový model: zod, ne OpenAPI codegen

**Doporučení: zod schémata pro odpovědi, ručně psané interfacy pro requesty, generátor vůbec.**

1. Generované typy by tu nic nedaly - u klíčových polí chybí `type`, generátor z nich udělá `unknown` a testy by byly plné `as string`. To vypadá jako typová bezpečnost a není.
2. Nejcennější, co od typové vrstvy chceme, je detekce driftu API. To umí jen runtime validace. TypeScript padne proti specifikaci, která je prokazatelně nepřesná; zod padne proti realitě.
3. `type Task = z.infer<typeof taskSchema>` dává schéma i typ jedním zápisem. Žádná duplicita.
4. **Nepředimenzovat:** schéma obsahuje jen pole, na kterých testy stojí. Zod neznámá pole odstraní, takže nové pole v odpovědi nic nerozbije. Na startu pět schémat: `task`, `project`, `section`, `due`, `paginated<T>`.

Requesty zůstávají ručně psané interfacy. Když pošleme nesmysl, odpoví API - a to je přesně to, co negativní test chce vidět.

---

## Prostředí

Tři proměnné, žádná chytristika.

```ts
// config/environments.ts
export const environments = {
  prod: 'https://app.todoist.com/api/v1',
  test: process.env.TODOIST_TEST_BASE_URL ?? '',
} as const
```

| Proměnná | V CI | Lokálně | Default |
|---|---|---|---|
| `TODOIST_BASE_URL` | `vars.TODOIST_BASE_URL` z GitHub Environment | `.env` | `https://app.todoist.com/api/v1` |
| `TODOIST_API_TOKEN` | `secrets.TODOIST_API_TOKEN` z Environment | `.env` | žádný, chybějící = fail fast |
| `TEST_WORKERS` | input workflow | `.env` | `1` |
| `TZ` | job-level env | `cross-env` v npm scriptu | `Europe/Prague` |

`TZ` musí být nastavené **před startem Node procesu**, proto patří na úroveň jobu, ne do `.env`. Past, na kterou se dá snadno narazit, patří do README.

`config/env.ts` validuje při startu (regex `^[0-9a-f]{40}$` na token) a při chybě vypíše **návod, ne stack trace**: kde token vzít, co doplnit do `.env`. Chytne se tím zkopírovaný token s mezerou na konci dřív, než se objeví 401 ve dvaceti testech.

Přepnutí na testovací prostředí = založit GitHub Environment `staging`, vyplnit secret a variable, spustit on-demand workflow s `environment: staging`. Nula změn v kódu.

---

## Úrovně testů

Úroveň = adresář = Playwright project. **Ne grep tag** - tag se dá zapomenout a netagovaný test pak nikdy nespustí žádná pipeline, tiše. Adresář zapomenout nejde.

```ts
// playwright.config.ts (výtah)
fullyParallel: true,   // sémantika paralelního běhu zapnutá od začátku
workers: Number(process.env.TEST_WORKERS ?? 1),  // škrtí se jen počet vláken

projects: [
  { name: 'smoke',      testDir: './tests/smoke' },
  { name: 'regression', testDir: './tests/regression', dependencies: ['smoke'] },
  { name: 'e2e',        testDir: './tests/e2e',        dependencies: ['smoke'] },
  { name: 'negative',   testDir: './tests/negative',   dependencies: ['smoke'] },
],
use: { baseURL: resolveBaseUrl(), trace: { mode: 'retain-on-failure', sources: false } },
```

**Naplnění zadání "1 vlákno, ale připravit na paralelizaci":** `fullyParallel: true` je zapnuté od prvního dne, takže každý test je od začátku psaný jako samostatná jednotka, která nic nesdílí. Škrtí se jen `workers`. Přechod na paralelní běh je pak změna jednoho čísla, ne přepis testů. `TEST_WORKERS` jde navíc přehodit inputem on-demand workflow, takže paralelizaci lze vyzkoušet jedním kliknutím.

**Smoke je tvrdá brána.** Všechny tři vyšší úrovně na něm závisí přes `dependencies`. Když smoke spadne, zbytek se přeskočí a v reportu je hned vidět, že je rozbitý produkt, ne že máme 40 červených testů.

Pořadí regression → e2e → negative je dané pořadím deklarace a při 1 workeru odpovídá pořadí spouštění. Vědomě **není** vynucené řetězem `dependencies`: jeden padlý regresní test by jinak zablokoval všechny E2E a přišli bychom o informaci. Brána je jen jedna a je na smoke.

---

## Mapování katalogu na úrovně

| Vlna katalogu | Playwright project | testDir | Test casy |
|---|---|---|---|
| Wave 0 foundation | žádný | - | infrastruktura, ne testy |
| Wave 1 smoke | `smoke` | `tests/smoke/` | TC-01 až TC-09 |
| Wave 2 features | `regression` | `tests/regression/` | TC-09a, TC-10 až TC-15 |
| Wave 3 chains | `e2e` | `tests/e2e/` | UC-E2E, TC-16, TC-17, TC-18 |
| Wave 4 negatives | `negative` | `tests/negative/` | TC-19 až TC-22 |
| Wave 5 contract review | **žádný** | `docs/findings/` | TC-23, TC-24 |

Wave 5 nejsou automatizované testy a nevznikne pro ně spec soubor. Jsou to review aktivity, jejichž výstupem je zapsaný finding a GitHub issue.

### Konvence ID v názvu testu

- Základ: `<ID> <název z katalogu>`, např. `TC-04 create a task in a project`
- Tři case mají v katalogu jednoslovný název (TC-07 sections, TC-08 labels, TC-09 comments). Tam se za dvojtečku doplní věta ze `Scope:` téhož case. Nic vymyšleného, jen text z katalogu.
- **Jeden TC se může rozpadnout na víc `test()` bloků.** Sufix `.N`, kde pořadové číslo odpovídá pořadí odrážky v acceptance criteria daného case, aby se dalo dohledat zpátky.
- **Parametrizované případy** (TC-09a per pole, TC-21 per operace) se generují cyklem nad zmrazeným literálovým polem, nikdy nad objektem. Parametr je v názvu v uvozovkách: `TC-09a.2 creating a task without "content" is rejected`. Katalog u TC-09a výslovně chce jeden case na pole, aby failure pojmenoval pole.
- `scripts/check-test-ids.ts` validuje regex `^(TC-\d{2}[a-z]?|UC-E2E)(\.\d+)? ` a navíc, že každé ID z katalogu je v suite aspoň jednou zastoupené. Chybějící case je pak červená pipeline, ne tichá díra v pokrytí.

### Wave 1 - smoke (9 testů)

Strop vlny podle katalogu: jeden test na endpoint, status a hrubý tvar. Žádné ověřování každého pole.

TC-01 až TC-03 v `projects.smoke.spec.ts`, TC-04 až TC-06 v `tasks.smoke.spec.ts`, TC-07 v `sections.smoke.spec.ts`, TC-08 v `labels.smoke.spec.ts`, TC-09 v `comments.smoke.spec.ts`.

Body z acceptance criteria, které mají přímý dopad na implementaci:
- **TC-02 a TC-05** mají explicitní zákaz předpokladů o obsahu účtu (hledat podle id, ne podle pozice, nepředpokládat krátký seznam). `list()` musí projít celou paginaci a žádná aserce nesmí být na délku seznamu. Na zaneřáděném osobním účtu je to rozdíl mezi zeleným a náhodně červeným testem.
- **TC-03** asertuje 404 po smazání projektu. U tasků víme, že DELETE je soft, u projektů ne. Wave 0 to ověří a pokud realita říká něco jiného, **vyhrává realita** a rozdíl jde do issue jako finding.
- **TC-04** má AC "deleting the parent project removes the task too (verify this assumption)". Proto si projekt vytváří sám a maže ho uvnitř testu, ne přes fixture `workspace`, aby měl kaskádu co ověřit.
- **TC-06** má AC "nespoléhá na fixní čekání, čte znovu dokud stav nesedí". To je `expect.poll()` nad čerstvým čtením, ne `waitForTimeout`.

### Wave 2 - features (7 TC, ~13 bloků)

Strop vlny: dvě až tři byznys pravidla, která by uživatel poznal. Ne každá kombinace parametrů.

| TC | Soubor | Bloků |
|---|---|---|
| TC-09a required and optional fields | `tasks/required-and-optional-fields.spec.ts` | 4 + N polí |
| TC-10 priority mapping | `tasks/priority.spec.ts` | 2 |
| TC-11 due date as a string | `due-dates/due-string.spec.ts` | 2 |
| TC-12 due date with explicit date and time | `due-dates/explicit-date-and-time.spec.ts` | 2 |
| TC-13 recurring task after completion | `due-dates/recurring.spec.ts` | 1 |
| TC-14 subtasks | `tasks/subtasks.spec.ts` | 3 |
| TC-15 moving a task between projects | `tasks/move.spec.ts` | 1 |

Rozpad TC-09a podle šesti odrážek katalogu:
```
TC-09a.1 creating a task with only the required fields succeeds
TC-09a.2 creating a task without "<field>" is rejected      ← cyklus nad REQUIRED_FIELDS
TC-09a.3 creating a task with every optional field set round-trips each value
TC-09a.4 the default of an omitted optional field is asserted explicitly
TC-09a.5 an unknown field is ignored or rejected, the test asserts which
TC-09a.6 a field sent with the wrong type is rejected, not coerced
```
`REQUIRED_FIELDS` je `as const` pole odvozené z aktuální dokumentace, ne z OpenAPI.

**TC-14 je rozdělený na tři bloky** z konkrétního důvodu: TC-14.3 maže rodiče, takže by ostatním asercím sebral data. Tři atomické testy, každý si postaví vlastní dvojici.

**TC-15 potřebuje dva projekty.** Špička je workspace + jeden navíc + Inbox, tedy 3 z 5. Sedí do rozpočtu.

### Wave 3 - chains (4 testy)

| TC | Soubor | Bloků |
|---|---|---|
| UC-E2E the recorded journey | `recorded-journey.e2e.spec.ts` | **přesně 1** |
| TC-16 a project from empty to done | `project-from-empty-to-done.e2e.spec.ts` | 1 |
| TC-17 task lifecycle with comments and labels | `task-lifecycle.e2e.spec.ts` | 1 |
| TC-18 bulk creation and consistency | `bulk-creation.e2e.spec.ts` | 1 |

- **UC-E2E se dělá jako první položka Wave 3** a katalog u něj říká "Do not write any other test". Jeden `test()`, pět kroků, každý ověřený čerstvým čtením, aserce na status **jednotlivého commandu**, ne na HTTP status obálky.
- **TC-18 má stejnou past s obálkou:** batch vrátí 200, zatímco command uvnitř selhal. Resource client proto vrací `sync_status` po commandech a test asertuje každý z nich. Katalog říká, že tohle je case na kontraktní diskusi - zelená suite, která skrývá rozbitou funkci.

### Wave 4 - negatives (4 TC, 12 bloků)

Strop vlny: povinná pole, jeden autorizační případ, jeden už smazaný. Ne hon na každou 4xx.

TC-19 invalid input (3 bloky: empty content, missing required field, unparseable due string), TC-20 authorization (3: no token, malformed token, cizí resource), TC-21 not found a already deleted (4: read, update, delete neexistujícího id, dvojí delete), TC-22 limits (2: dlouhý content, hodně labelů).

- **TC-20.3 potřebuje druhý token** s validním přístupem jinam. Účastníci mají vlastní účty, takže druhý token je dostupný, ale framework ho nesmí vyžadovat: `TODOIST_API_TOKEN_SECONDARY` je nepovinný a bez něj se TC-20.3 přeskočí s **explicitní anotací v reportu**, proč. To je spolu s TC-22 jediný povolený druh skipu - skip kvůli selhání přípravy dat zůstává zakázaný.
- **TC-20** má AC "no real token is ever logged, including in the failure output". Redakce tokenu v chybových hláškách je podmínkou mergnutí tohoto souboru.
- **TC-21.4 je místo, kde narazíme na soft delete.** Druhé DELETE tasku pravděpodobně nevrátí 404. Asertuje se realita.
- **TC-22 má v katalogu explicitní povolení testy přeskočit,** pokud limit není dokumentovaný a nedá se objevit v rozpočtu času. Skip je tady legitimní výsledek, ale musí mít anotaci s důvodem.

### Wave 5 - contract review (bez spec souborů)

TC-23 dodá `docs/findings/TC-23-docs-vs-reality.md` + issue: seznam endpointů, které aplikace používá a dokumentace nepopisuje, seznam polí navíc, a aspoň jeden rozdíl převedený na test, který dnes padá, **nebo** na zapsaný finding. Vstupem je dokumentace a `temp/todoist-e2e.har`.

TC-24 dodá `docs/findings/TC-24-missing-coverage.md` + issue: endpointy bez testu, status kódy, které nikdo neasertuje, pravidla z dokumentace bez pokrytí. **Seznam reviduje člověk** a rozhoduje, co stojí za napsání. Agent z toho sám nezakládá nové test casy.

### Objem

| Vlna | TC | `test()` bloků |
|---|---|---|
| Wave 1 smoke | 9 | 9 |
| Wave 2 features | 7 | ~13 + N |
| Wave 3 chains | 4 | 4 |
| Wave 4 negatives | 4 | 12 |
| **automatizovaně celkem** | **24** | **~38 + N** |
| Wave 5 review | 2 | 0 |

Plný běh na jednom vlákně pod 10 minut, smoke pod 60 sekund. Jakmile plný běh přesáhne 15 minut, je čas na paralelizaci.

### Vzorový test

```ts
// tests/smoke/tasks.smoke.spec.ts
import { expect, test } from '../../fixtures/test'

test('TC-04 create a task in a project', async ({ projects, tasks, tracker, data }) => {
  const project = await test.step('Setup: create the project', async () => {
    const created = await projects.create({ name: data.projectName() })
    tracker.track('project', created.id)
    return created
  })

  const input = data.task({ scenario: 'create in a project', project_id: project.id })

  const created = await test.step('Create the task', async () => {
    const task = await tasks.create(input)
    tracker.track('task', task.id)
    return task
  })

  await test.step('The task carries the content and the project that were sent', async () => {
    expect(created.id).toBeTruthy()
    expect(created.content).toBe(input.content)
    expect(created.project_id).toBe(project.id)
  })

  await test.step('The task appears when listing tasks of that project', async () => {
    const listed = await tasks.listByProject(project.id)
    expect(listed.map((task) => task.id)).toContain(created.id)
  })

  // Katalog chce ověřit předpoklad, že smazání rodiče odstraní i task. Aserce je na
  // is_deleted, ne na 404, protože mazání je u Todoistu soft delete.
  await test.step('Deleting the parent project removes the task as well', async () => {
    await projects.delete(project.id)
    await expect.poll(async () => (await tasks.get(created.id)).is_deleted).toBe(true)
  })
})
```

Test nemá `afterEach`. Úklid dělá teardown fixtury `tracker`, což platí i když test spadne nebo vytimeoutuje.

### Konvence pojmenování

- **Soubory:** `tests/<level>/<area>/<topic>.spec.ts`, kebab-case
- **Název testu:** `<TC-id> <věta v přítomném čase popisující výsledek pro uživatele>`. Dobře: `TC-06 complete and reopen a task`. Špatně: `TC-06 POST /tasks/{id}/close returns 204`
- **Kroky:** přípravné mají prefix `Setup:`, aby bylo v reportu poznat, že nespadl produkt, ale příprava dat
- **Proměnné:** `created`, `fetched`, `input`, `expected`. Žádné `res`, `data1`
- **Komentáře:** jen tam, kde kód nevysvětluje *proč*. Typicky u ověřených odchylek od dokumentace. Nikdy komentář opakující název metody
- **Bez logování:** žádný vlastní logger. Kroky, aserce a trace v HTML reportu jsou celá diagnostika (zadání 10.8)

### Kandidáti na rozšíření nad rámec katalogu

Nepíšou se teď, každý by potřeboval nové katalogové ID schválené Lucií nebo Anastasiyou. Zásobník na chvíli, kdy se bude suite rozšiřovat: barva a favorite flag projektu; task bez `project_id` padne do Inboxu; `duration` round-trip; quick add parsuje anglickou frázi (ověřeno živě, stojí za test, ne jen komentář); `deadline_date` nezávislý na due date; odebrání termínu z tasku; zoned vs. floating due datetime (katalog testuje dva ze tří druhů); paginace přes `next_cursor`; překročení `max_projects` na Free.

---

## Testy, které se musí dělat ručně

Prefix `MT` je zvolený tak, aby se nepral s `TC` a `UC` z katalogu. Registr je `docs/manual-tests.md`. Zadání bod 5.5 to vyžaduje explicitně.

| ID | Co | Proč ručně |
|---|---|---|
| MT-01 | Nastavení účtu a workspace (Settings) | Zadání 13.1: schéma API se bude měnit, automatizace by se zahodila |
| MT-02 | Placené funkce: reminders s vlastním offsetem, pokročilé filtry, historie aktivit, zálohy | Testujeme jen Free. `user_plan_limits` hlásí `reminders: false`, API je odmítne |
| MT-03 | Limity počtu tasků (300) a labelů (500) | Vytvoření 300 tasků je pomalé, spálí nedokumentovaný rate limit a zaneřádí účet. 1x za release |
| MT-04 | Přílohy a upload (limit 5 MB) | Binární upload, mimo scope suite |
| MT-05 | Doručení notifikace pro `reminders_at_due` | Doručení je za hranicí API, nedá se ověřit HTTP odpovědí |
| MT-06 | Zobrazení termínu v aplikaci na zařízení v jiné timezone | Automat ověří jen API odpověď. Jestli appka zobrazí správný lokální den, je UI věc, a právě tam je největší riziko domény |
| MT-07 | Quick add v aplikaci v češtině | Ověřeno: API parser je jen anglický. Jestli to appka řeší na klientovi, se přes API zjistit nedá |
| MT-08 | Rotace a revokace API tokenu | Vyžaduje UI, API tokenem to nejde |
| MT-09 | Sdílení projektu, pozvánky | Vyžaduje druhý účet a e-mail, mimo scope |
| MT-10 | Chování pod zátěží a hranice rate limitu | Zadání 7.2 performance testy vylučuje |
| MT-11 | Smazání účtu a exporty dat | Nevratné |
| MT-12 | Explorativní session nad changelogem nové verze API | Lidský úsudek, plodí návrhy nových katalogových case |

MT-03 se částečně překrývá s TC-22. MT-03 je drahá vyčerpávající verze pro release, TC-22 je levná kontrola v suite.

---

## Co vědomě neautomatizujeme

| Co | Proč |
|---|---|
| Nastavení účtu a workspace | Zadání 13.1, schéma API se bude měnit |
| Placené funkce | Zadání 13.2, Free účet je nevyvolá |
| Performance a rate limity | Zadání 7.2 |
| Matice timezone × due_lang | Násobení běhů bez odpovídající hodnoty při tomto scope. Zůstává jeden pevný TZ slot a relativní aserce |
| Sdílení, spolupráce, druhý uživatel | Scope je jeden uživatel |
| Generování typů z OpenAPI | Spec nemá `type` u klíčových polí |
| Kompletní pokrytí 4xx | Zadání 5.4 chce malý subset; katalog má explicitní strop vlny |
| Vlastní logger a reporting vrstva | Zadání 10.8 a 11: stačí Playwright HTML report. Allure až později, a pak jako reporter, ne zásah do testů |

---

## Fázování

Vlny katalogu jsou zároveň jednotkou pro zakládání issues. Každé issue = jedna větev z `main` = jeden PR. Agent PR nemergeuje.

### Wave 0 - foundation

Katalog vyžaduje čtyři věci: auth helper, data factory s registrací pro cleanup, cleanup běžící i při failu a ignorující "already deleted", a sdílený assertion helper pro schema vrstvu.

Obsah: `package.json`, `tsconfig`, eslint + prettier, `.env.example`, README s instalací a spuštěním, `playwright.config.ts`, `config/`, `src/api/client.ts` + `errors.ts`, `ProjectsApi`, `project.schema.ts`, `ResourceTracker`, `fixtures/test.ts`, `global-setup.ts`, `global-teardown.ts`, a TC-01 jako důkaz, že to drží.

**Acceptance criteria (doslova z katalogu):**
- [ ] jeden smoke test projde lokálně přes `npm test`
- [ ] dvojí spuštění suite za sebou nechá účet ve stejném stavu jako předtím
- [ ] v repu není žádný credential

**Spike, který je součástí Wave 0** a jehož výstupy jdou do issue jako findings: hard vs. soft delete u projektů; počítají se soft-deleted tasky do limitu; vynechávají list endpointy soft-deleted položky samy; potvrdit cesty `/sections`, `/comments`, `/labels` proti aktuální dokumentaci.

**Souběžně s Wave 0 jde bezpečnostní vrstva CI:** `redact.ts`, `sanitize-artifacts.ts`, `verify-no-secrets.ts`, `artifacts-security.spec.ts`. **Dřív než jakýkoli upload artefaktu.**

### Wave 1 - smoke

TC-01 až TC-09. Doplní se `TasksApi`, `SectionsApi`, `LabelsApi`, `CommentsApi` a zbývající zod schémata, fixture `workspace`.

Rozdělení na tři issues: projects (TC-01 až TC-03), tasks (TC-04 až TC-06), sections + labels + comments (TC-07 až TC-09). Tři PR, každý použitelný samostatně.

Hotovo: smoke pod 60 s, dvakrát za sebou zeleně, účet po běhu beze změny.

### Wave 2 - features

**TC-09a jde první** - katalog ho označuje za case, který najde nejvíc, a za nevynechatelný i v krátkém dni. Pak TC-10 až TC-15.

Issues: TC-09a samostatně, TC-10 + TC-14 + TC-15 (tasks), TC-11 + TC-12 + TC-13 (due dates). Due dates vědomě jako poslední - jsou nejrizikovější a chtějí stabilní zbytek pod sebou.

### Wave 3 - chains

**Blokované na dodání `temp/todoist-e2e.har`.** UC-E2E je první položka a bez HARu se vlna nezačíná, protože jeho hodnota je právě v porovnání nahrávky s veřejnou dokumentací, ne v tom, že projde pět volání.

Postup podle katalogu: HAR se do konverzace nevkládá, ukáže se na soubor. Nejdřív vznikne seznam volání v pořadí i s commandem uvnitř a informace, která z nich veřejná dokumentace nepopisuje. Ten seznam jde do issue. **Teprve pak vznikne jeden test.**

Po UC-E2E následují TC-16, TC-17, TC-18. Když některý z nich vyžaduje nový kód ve vrstvách, je to signál, že resource client něco neumí, a doplní se tam, ne do testu.

### Wave 4 - negatives

TC-19 až TC-22, jedno issue na case. TC-20 má tvrdou podmínku mergnutí: token se neobjeví v žádném výstupu při failu.

### Wave 5 - contract review

TC-23 a TC-24. Nevznikají spec soubory, vznikají `docs/findings/*.md` a issues. TC-23 potřebuje HAR stejně jako UC-E2E, takže se dělá až po Wave 3.

### Krátká varianta

Katalog nabízí zkratku, kdyby byl čas jen na čtyři položky: **UC-E2E, TC-09a, TC-13, TC-23**. Pokrývají vícekrokový řetězec, past s obálkou, kontrakt payloadu, byznys pravidlo a finding proti specifikaci. Wave 0 je podmínkou i pro tuhle variantu.

---

## Test data a izolace

- **Nikdy fixní data v účtu.** Žádný test nepředpokládá, že něco existuje. Účty účastníků budou různě staré a různě zaneřáděné.
- **`data` factory** staví validní payload s rozumnými defaulty, test přepíše jen to, na čem scénář stojí. Test pak čte jako popis scénáře, ne jako skládání JSONu.
- **`workspace` fixture** vytvoří projekt lazy, až si o něj test řekne. Testy, které projekt nepotřebují (autorizace, 404), ho nevytvoří a nespálí kapacitu.

**Pojmenování** (`src/data/ids.ts` je jediný zdroj pravdy):
- `runId` = `<unix timestamp>-<4 hex>`. Časová složka umožní poznat stáří osiřelého projektu, hex zabrání kolizi dvou běhů ve stejné sekundě.
- Projekt: `QA <runId> <TC-id>`, prefix `QA ` včetně mezery
- Task: `[<runId>][<TC-id>] <scenario>`
- Label: `qa-<runId>-<suffix>`

Prefix plní dvě role: izolaci mezi souběžnými běhy a **bezpečnostní pojistku pro úklid** - nikdy se nemaže nic bez prefixu.

### Limit 5 projektů

```
Inbox (1) + projekty tohoto běhu ≤ 5
projekty běhu = workers × (1 workspace + max 1 extra na test)
```

Při 1 workeru je špička 3, pohodlná rezerva. **Při paralelizaci to znamená strop 2 workery na Free plánu.** To je nejdůležitější důsledek: "připravit na paralelizaci" není zadarmo, limit účtu ji stropuje dřív než cokoli v kódu.

Pojistky:
- `globalSetup` spočítá projekty **po orphan sweepu** a když nezbývá kapacita, ukončí běh s hláškou "účet drží N projektů, limit je 5, spusť `npm run account:cleanup`"
- fixture vrstva hlídá rozpočet běhu a při překročení spadne s vysvětlením, ne s 4xx od API

### Když příprava dat selže

Zadání bod 14.5 zakazuje silent fail. Čtyři mechanismy:

1. Resource client vyhodí typovanou chybu na jakýkoli non-2xx. Nikdy nevrací `undefined` jako "nepodařilo se".
2. Přípravné kroky jsou v `test.step('Setup: ...')`. V reportu je okamžitě vidět, jestli spadl produkt nebo příprava.
3. **Zákaz `test.skip()` při selhání přípravy.** Skip vypadá v reportu jako zelená - to je přesně ten silent fail. Skip je povolen jen pro vědomě nedostupnou funkcionalitu, nikdy pro chybu.
4. `globalSetup` ukončí běh při neplatném tokenu nebo nedostatku kapacity s návodnou hláškou. Lepší selhat na začátku než po deseti minutách uprostřed.

---

## Cleanup

Čtyři úrovně, každá chytá, co propadlo tou nad ní.

1. **`tracker` teardown (per test).** Maže v opačném pořadí vzniku, takže projekt jde až po svém obsahu. Běží i po failu i po timeoutu. Chyba mazání **nikdy neshodí test** - jen warning. Test, který spadl na aserci, nesmí být přebarven na "cleanup failed".
2. **`globalTeardown`.** Smaže projekty s prefixem `QA <runId>` (kaskádou zmizí sekce, tasky, komentáře) a pak tasky v Inboxu začínající `[<runId>]`.
3. **Orphan sweep v `globalSetup`,** před vytvořením čehokoli. Projekty s prefixem `QA ` starší než **2 hodiny** se mažou. Ne 24 h jako bývá zvykem: smoke běží každou hodinu a na 5 projektech není prostor nechat vyhnívat den starý odpad. Projekt s prefixem, ale nečitelným `runId`, se **nemaže**, jen hlásí warning - může to být cokoli, co udělal člověk rukou.
4. **`npm run account:cleanup`.** Manuální skript, dry-run by default, `--force` provede.

### Soft delete: co to mění

`DELETE /tasks/{id}` je soft delete. Promítá se to na čtyřech místech:

- **Aserce po smazání nesmí čekat 404.** Sdílený helper `expectSoftDeleted(task)` asertuje `is_deleted === true` plus nepřítomnost v aktivním seznamu. Jedno místo k opravě, kdyby Todoist sémantiku změnil.
- **Tracker nesmí poznávat "už je pryč" jen podle 404.** Opakované DELETE vrátí nejspíš 2xx. Tracker považuje za úspěch 2xx i 404.
- **Sémantika DELETE u projektů se musí ověřit zvlášť.** Katalog u TC-03 předpokládá 404 po smazání projektu. To je přesně ten případ, kdy platí pravidlo z katalogu: test tvrdí **skutečné** chování a rozdíl jde do issue jako finding.
- **Otevřená otázka s provozním dopadem:** počítají se soft-deleted tasky do `max_tasks: 300`? Když ano, účet se při hodinovém smoke zaplní během dní. Ověřit ve Wave 0.

---

## Bezpečnost ve veřejném repu

Repo je veřejné a zadání chce nahrávat traces. Playwright trace obsahuje `Authorization: Bearer <token>`. Token neexpiruje. Tohle je nejrizikovější místo celého návrhu.

**Princip: sanitizace je opatření, verifikace je záruka. Nic, co neprošlo verifikací, neopustí runner.**

### Kde všude token je

Naivní `grep -r` ho nenajde:

| Místo | Najde textový grep? |
|---|---|
| `test-results/*/trace.zip` → `trace.network`, `trace.trace` | ne, je v zipu |
| `playwright-report/data/*.zip` (kopie traces) | ne |
| `playwright-report/index.html` - data vložená jako **base64 zip uvnitř HTML** | ne |
| `test-results/junit.xml`, vlastní attachmenty | ano |
| log jobu | GitHub maskuje `secrets.*` automaticky |

Poslední řádek je důležitý: **maskování v logu se nevztahuje na obsah souborů v artefaktech.**

### Prevence v kódu - co pomůže a co ne

Poctivě: **`extraHTTPHeaders` ani per-request hlavička token z trace nevyženou.** Playwright zapisuje hlavičky tak, jak odešly na drát. Rozdíl je jen v počtu výskytů - při `extraHTTPHeaders` na contextu se token objeví navíc jen jednou, při per-request v parametrech každé akce. Méně míst = méně věcí, co může sanitizér minout. Používáme to jako defense in depth, ne jako záruku.

`trace: { sources: false }` vyřadí kopie zdrojáků: menší artefakt, méně obsahu k prohledávání.

Skutečná prevence by byla lokální reverzní proxy (`baseURL` míří na `127.0.0.1`, klient posílá `Bearer PLACEHOLDER`, proxy ho na cestě ven nahradí). Do trace by se dostal jen placeholder. Cena: hop navíc, v trace není skutečná URL, další věc, co se může rozbít. **Zapsat do `docs/adr/` jako zvážené a odložené, neimplementovat teď.**

### `scripts/sanitize-artifacts.ts`

1. Načíst secrets. **Prázdný seznam = exit 1.** Sanitizér, který nemá co redigovat, je nejnebezpečnější stav - tiše projde.
2. Projít `playwright-report/`, `test-results/`, `blob-report/`. **Žádný soubor = exit 1** (špatná cesta = falešné bezpečí).
3. Podle typu: `.zip` rozbalit v paměti (`fflate`), zredigovat, **rekurzivně** zpracovat vnořené zipy, zabalit zpět. `index.html` zredigovat jako text **a navíc** dekódovat base64 payload a zpracovat jako zip. Ostatní na úrovni bufferu, ne stringu.
4. Náhrada je **délkově konzistentní**: `'REDACTED'.padEnd(secret.length, '*')`. Některé formáty uvnitř trace nesou offsety; zachovaná délka eliminuje celou třídu problémů s poškozeným artefaktem.
5. Vypsat počet nahrazení. Nula nahrazení u běhu s padlým testem je podezřelý stav a má být vidět.

### `scripts/verify-no-secrets.ts` - blokující

Stejný průchod, ale hledá. Tři nezávislé detektory:

1. Přesná hodnota ze `TODOIST_API_TOKEN`
2. Tvarový regex `Bearer\s+[A-Fa-f0-9]{40}`. **Holý `[0-9a-f]{40}` nepoužívat** - git commit SHA má přesně 40 hex znaků a Playwright si git revizi do metadat ukládá. Falešný poplach by lidi naučil verifikaci ignorovat, což je horší než ji nemít.
3. Klíč `authorization` v JSON/NDJSON, jehož hodnota není maskovaná

Při nálezu exit 1 a do logu **cesta a offset, nikdy nalezená hodnota** (log je veřejný). Upload je podmíněný na `steps.verify.outcome == 'success'`.

### Verifikace, která se sama testuje

`tests/unit/artifacts-security.spec.ts`, běží ve static jobu, **tedy i na PR z forku, protože nepotřebuje reálný token**:

1. Vyrobí strom artefaktů s **falešným** 40hex tokenem ve všech pěti úkrytech (plain text, položka v `trace.zip`, vnořený zip, base64 blob v `index.html`, attachment)
2. Verifier musí najít všech pět
3. Sanitizer
4. Verifier musí najít nula
5. Sanitizovaný `trace.zip` je pořád validní zip, `index.html` pořád parsovatelné
6. Verifier s prázdným seznamem secrets **selže**; sanitizer nad prázdným adresářem **selže**

Když někdo za půl roku upgraduje Playwright a ten změní formát reportu, tenhle test spadne dřív, než se něco nahraje. Bezpečnostní kontrola, kterou nikdo netestuje, je jen pocit.

### HAR soubor

`temp/todoist-e2e.har` je nahrávka přihlášené session z webové aplikace. Typicky obsahuje **cookies a auth hlavičky**. Ve veřejném repu je to únik srovnatelný s tokenem.

- `temp/` patří do `.gitignore`
- Účastníci si HAR drží lokálně, do repa se necommituje
- Pokud by ho bylo nutné sdílet, musí projít stejným sanitizérem a navíc se z něj musí odstranit `Cookie`, `Set-Cookie` a `X-Csrf-Token`
- Do `CONTRIBUTING.md` patří explicitní řádek "HAR nahrávky se do repa necommitují"

---

## CI/CD

Šest workflow souborů, z toho jeden reusable, který drží veškerou logiku běhu. Triggery jsou tenké obálky. Důvod: řetězec "spusť - ukliď - sanituj - ověř - nahraj - shrň" existuje právě jednou, takže bezpečnostní kroky nelze v jedné z variant omylem vynechat.

```
.github/workflows/
  _run-suite.yml        reusable (workflow_call) - celý běh proti živému účtu
  pr.yml                pull_request - static checks + live suite + gate
  smoke-hourly.yml      cron 1x/h
  regression-daily.yml  cron 16:00 Europe/Prague (2 crony + DST gate)
  on-demand.yml         workflow_dispatch - volba úrovně, prostředí, workers
  cleanup-account.yml   cron 1x denně + dispatch - úklid osiřelých dat
```

### `_run-suite.yml` - jádro

Kroky v pořadí: checkout → setup-node 22 s npm cache → `npm ci` → **preflight kapacity účtu** → run suite → **sanitize** → **verify** → upload HTML report (jen když verify prošel) → upload traces (dtto) → shred artefaktů když verify selhal → cleanup účtu (`if: always()`) → job summary.

Detaily, které nejsou kosmetické:
- `permissions: contents: read` na úrovni workflow. Job, který sahá na token a trace, nikdy nemá vyšší oprávnění.
- `environment:` scopuje secret, takže ho static job a gate job nevidí ani omylem.
- **Žádné `npx playwright install`.** API testy běží přes `request` fixture, prohlížeč není potřeba. Ušetří ~40 s a ~300 MB na běh.
- `compression-level: 0` u traces - zip v zipu se nekomprimuje.
- `run_attempt` v názvu artefaktu je nutnost: `upload-artifact@v4` odmítne duplicitní jméno a re-run by jinak selhal.

### Celá sada na PR ve veřejném repu

Rozbor variant:

| Varianta | Dostane fork token? | Verdikt |
|---|---|---|
| `pull_request` + secrets | **Ne**, GitHub secrets se do běhu z forku nikdy nepředávají | použitelné jen s explicitním guardem |
| `pull_request_target` | **Ano**, plné secrets. Checkout PR head = útočník spustí vlastní kód s tokenem | **nikdy nepoužívat** |
| `pull_request_target` + required reviewers | ano, po schválení | reviewer schvaluje běh, ne diff řádek po řádku. Stačí `npm ci` postscript, co si sáhne na `$TODOIST_API_TOKEN`. Zamítnuto |
| **`pull_request` + guard `head.repo.full_name == github.repository`** | ne, job se skipne | **doporučeno** |

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
# synchronize = "po každém commitu" ze zadání 9.4

live:
  if: >-
    github.event.pull_request.draft == false &&
    github.event.pull_request.head.repo.full_name == github.repository
```

**Co to znamená pro fork PR, natvrdo:** celou sadu na nich spustit nelze, aniž bys buď vydal token, nebo pustil cizí kód s přístupem k němu. Neexistuje varianta, která obojí obejde. Protože účastníci workshopu i agent pracují na větvích v tomto repu, je to v praxi neomezuje. Postup pro cizí příspěvek je v `CONTRIBUTING.md`: maintainer si větev přetáhne do repa a otevře interní PR.

**Gate job** je nutnost, ne ozdoba: `live` job se u forků a draftů skipne, a **skipnutý required check blokuje merge navždy**. Gate běží vždy (`if: always()`), agreguje výsledky a je jediný required check kromě `static`. U forku failuje s vysvětlující hláškou, takže se na to nedá zapomenout.

Static job běží i u forků - fork dostane smysluplnou zpětnou vazbu (typecheck, lint, unit testy, `playwright test --list`) bez přístupu k tokenu.

### Cron 16:00 a letní čas

**GitHub Actions cron je vždy UTC a nejde mu zadat timezone.** 16:00 v Praze je 15:00 UTC v zimě a 14:00 UTC v létě.

Řešení: dva crony + runtime gate, který rozhoduje podle toho, **který cron vystřelil**, ne podle aktuální hodiny. Díky tomu zpoždění schedule eventu o desítky minut nic nerozbije.

```yaml
schedule:
  - cron: '10 14 * * *'   # 16:10 Praha během CEST (UTC+2)
  - cron: '10 15 * * *'   # 16:10 Praha během CET  (UTC+1)
```

```bash
offset=$(TZ=Europe/Prague date +%z)
case "$offset" in
  +0200) want='10 14 * * *' ;;
  +0100) want='10 15 * * *' ;;
esac
[ "$GITHUB_EVENT_SCHEDULE" = "$want" ] && run=true || run=false
```

Minuta 10 a 25 místo 0: GitHub schedule eventy odkládá a na celou hodinu má největší frontu.

Zbývající edge case: v den přechodu proběhne regrese jednou za rok v 15:00 nebo 17:00 místní, případně vynechá. U denní regrese nezajímavé, ale **musí to být v README**, aby to za rok někdo nehledal jako bug.

### Concurrency

Sdílený zdroj není pipeline, ale **účet**: 5 projektů, 300 tasků, neznámý rate limit.

Zamítnutá varianta: jedna skupina pro všechno. GitHub drží ve frontě **jen jeden** čekající běh na skupinu, třetí příchozí ten druhý zruší. U smoke nevadí, u PR to znamená required check ve stavu `cancelled` a nemergovatelný PR. Při 24 smoke bězích denně plus aktivních PR by se to dělo pravidelně.

**Doporučeno - segmentace podle vlastníka dat:**

```yaml
# smoke-hourly, regression-daily, on-demand, cleanup-account:
concurrency: { group: todoist-account-scheduled, cancel-in-progress: false }

# pr.yml live job:
concurrency: { group: todoist-account-pr-${{ github.event.pull_request.number }}, cancel-in-progress: true }
```

Veškerý neobsluhovaný provoz je serializovaný do jedné fronty. Každý PR má vlastní frontu a nový commit ruší předchozí běh téhož PR - o výsledek předminulého commitu nikdo nestojí. Data se nerozbijí, protože každý běh má vlastní `runId` a prefix.

Zbývající riziko je kapacita projektů, ne kolize dat. Řeší ho preflight (fail fast s čitelnou hláškou místo dvaceti 403) a **`cleanup-account.yml`** - `cancel-in-progress: true` u PR znamená, že zrušený běh nedoběhne do teardownu a nechá po sobě projekt. Janitor je to, co tuhle díru zavírá.

### Secrets

**GitHub Environments, ne repository secrets.** Dva: `production` (vyplněný) a `staging` (připravený, prázdný). Každý drží `TODOIST_API_TOKEN` jako secret a `TODOIST_BASE_URL` jako variable.

Proč: token dostane jen job s `environment: production`; přepnutí prostředí je hodnota v inputu, ne editace workflow; environment lze později doplnit o required reviewers bez změny workflow souborů; v přehledu Environments je zdarma audit.

**Jeden token.** Zadání chce jednoho uživatele, takže žádný sekundární token.

Vrstvy ochrany proti úniku do forku, každá sama o sobě dostatečná:
1. GitHub secrets se do běhu z forku nepředávají - platformní záruka, ne naše konfigurace
2. `pull_request_target` se v repu nepoužívá vůbec; do review checklistu patří "PR, který ho přidává, se nemerguje bez bezpečnostního review"
3. Explicitní guard na `head.repo.full_name`
4. Workflow-level `permissions: contents: read`
5. Third-party actions pinnuté na commit SHA (tag lze přepsat), `actions/*` od GitHubu stačí na majoru
6. Repo setting: Actions → "Require approval for all external contributors"
7. **Secret scanning + Push protection** (zdarma pro veřejné repo) a Dependabot

### Artefakty

| Artefakt | Kdy | Retention |
|---|---|---|
| `playwright-report/` (HTML + traces v `data/`) | vždy, po verifikaci | PR 14 dní, regrese 30, smoke 7 |
| `test-results/**/trace.zip` | jen při selhání (`retain-on-failure`) | dtto |
| `junit.xml` | vždy | součást html-report artefaktu |

HTML report už kopie traces obsahuje. Samostatný `traces` artefakt je duplicita, ale malá a užitečná - lze ho přetáhnout přímo do `trace.playwright.dev` bez rozbalování celého reportu. Zadání 9.5 chce obojí explicitně.

Retention u smoke je nejkratší záměrně: 24 běhů denně, nikdo se ke starším nevrací, a **kratší retention = kratší okno expozice**, kdyby sanitizace někdy selhala.

**Job summary** (`scripts/ci-summary.ts` → `$GITHUB_STEP_SUMMARY`): tabulka suite/environment/workers/duration/secret scan, tabulka výsledků po úrovních, seznam failed testů s odkazy na artefakty. Chybové hlášky **musí projít `redact()`**. Limit summary je 1 MiB, proto seznam failed omezit na 25 s poznámkou "a dalších N".

---

## Collaboration

### Branch protection na `main` (Repository ruleset, bypass list prázdný)

- Restrict deletions, Block force pushes, Require linear history
- **Require a pull request before merging**: 1 approval, dismiss stale approvals on new commits, **require review from Code Owners**, require approval of the most recent reviewable push, require conversation resolution
- **Require status checks**: `Static checks`, `PR gate`; require branches up to date

Repo settings: squash merge only, **auto-merge vypnutý** (jinak by agent mohl zapnout auto-merge a PR by se slil sám), automatically delete head branches on.

### Jak vynutit, že agent nemerguje

Tohle je jediná část zadání, kterou **nelze splnit konfigurací repa, dokud agent běží pod lidskou identitou.** Agent používá přihlášení `gh` CLI Lucie; z pohledu GitHubu *je* Lucie. Pravidlo 15.3 je dnes **politika, ne kontrola**.

**Skutečné řešení, doporučuji jako první issue v repu:** dát agentovi vlastní identitu - fine-grained PAT z odděleného účtu nebo GitHub App s `Contents: rw`, `Issues: rw`, `Pull requests: rw`, `Metadata: read`. Tato identita **není v CODEOWNERS**. Pak merge fyzicky nejde:

1. Merge vyžaduje approval od Code Ownera → agent jím není
2. GitHub nedovolí schválit vlastní PR → agent nemůže schválit ani svůj
3. "Require approval of most recent push" → commit do schváleného PR approval zruší
4. Prázdný bypass list → žádná cesta kolem

Dokud oddělená identita neexistuje, platí zmírnění (nejsou to záruky): auto-merge vypnutý, ruleset bez bypassu, tvrdý zákaz v `CLAUDE.md` na `gh pr merge`, `gh pr review --approve`, `git push origin main`, a periodický audit `gh api repos/:owner/:repo/pulls?state=closed --jq '.[] | {number, merged_by: .merged_by.login}'`.

### Issues, větve, PR

Katalog v repu **už obsahuje issue template** (Scope / API documentation / Example request and response / Acceptance criteria / Must not break / Out of scope). Použít ho, ne vymýšlet vlastní.

- Jeden test case = jedno issue = jedna větev = jeden PR
- Větev: `test/tc-04-create-task-in-project`, pro ostatní práci `issue-<číslo>-<slug>`
- Labely: `type/{bug,feature,task,tests,ci,docs}`, `area/{framework,tests,ci}`, `risk/security`, `blocked`, `needs-human-decision`. Zakládá se jednou přes `scripts/setup-labels.sh`

**PR template** musí mít sekce, které zadání 15.4 vyžaduje jako odevzdání: *Related issue*, *Co se změnilo a proč*, *Přehled změn* (tabulka), *Rizika a věci k dořešení*, *Handover* (odkaz na issue, odkaz na PR, kdo schvaluje). Tím, že jsou v šabloně, není odevzdání závislé na tom, jestli si na ně agent vzpomene.

Checklist v PR template: žádný token/e-mail v diffu ani uvnitř vloženého logu; testy po sobě uklízejí; nepřidal jsem `pull_request_target` ani `secrets: inherit`; nové actions pinnuté na SHA; názvy testů obsahují TC ID.

---

## README - osnova

Zadání 4.1 chce "jak nainstalovat a spustit". To musí fungovat od nuly bez ptaní.

1. **Prerekvizity** - Node 22+, npm, Todoist účet vyhrazený pro testování
2. **Instalace** - clone, `npm ci`, `cp .env.example .env`
3. **Získání API tokenu** - Settings → Integrations → Developer. 40 hex znaků, **neexpiruje**, nemá scopy, dává plný přístup k účtu. Nikdy necommitovat, nevkládat do issue ani PR. Odkaz na runbook rotace. *Každý účastník si dělá vlastní token na vlastním účtu.*
4. **Spuštění** - `npm test`, `npm run test:smoke`, `npx playwright test -g "TC-04"`, `npx playwright show-report`
5. **Co testy dělají s účtem** - zakládají projekt `QA <runId>`, mažou ho. Free limity. `account:preflight`, `account:cleanup`
6. **Struktura repozitáře** - odkaz na `docs/architecture.md`
7. **Prostředí** - tabulka env proměnných, jak přepnout, proč `TZ` není v `.env`
8. **CI** - tabulka workflow, vysvětlení 16:00 vs. UTC a DST gate, jak spustit on-demand, proč se celá sada nepouští na PR z forku
9. **Artefakty** - kde je stáhnout, jak otevřít trace, co znamená `REDACTED********`
10. **Bezpečnost** - repo je veřejné, vrstvy ochrany tokenu
11. **Troubleshooting** - tabulka symptom / příčina / řešení: 401 na všech testech, 403 project limit reached, padá jen v CI (jiná TZ), regrese neběžela v 16:00, PR gate červený a live skipnutý, scheduled workflow přestal běžet po 60 dnech nečinnosti
12. **Přispívání** - odkaz na CONTRIBUTING.md

---

## Struktura repozitáře

```
tf2026-workshop-api-claude/
├─ .github/
│  ├─ workflows/              6 souborů, viz CI/CD
│  ├─ ISSUE_TEMPLATE/         šablona z katalogu + bug/task/ci
│  ├─ PULL_REQUEST_TEMPLATE.md
│  └─ CODEOWNERS
├─ config/
│  ├─ environments.ts         pojmenovaná prostředí a jejich base URL
│  └─ env.ts                  validace process.env, fail fast s návodem
├─ src/
│  ├─ api/
│  │  ├─ client.ts            jediné místo, které mluví HTTP
│  │  ├─ errors.ts            typované chyby mapované ze status kódů
│  │  └─ resources/           *.api.ts - "page objects" pro API
│  ├─ schemas/                zod schémata odpovědí, zdroj response typů
│  ├─ data/
│  │  ├─ ids.ts               runId, prefixy, konvence pojmenování
│  │  └─ task.factory.ts      validní payload s rozumnými defaulty
│  └─ support/
│     ├─ resource-tracker.ts  evidence resources pro cleanup
│     ├─ redact.ts            jediné místo, které zná tvar tokenu
│     ├─ assertions.ts        doménové aserce (expectSoftDeleted, ...)
│     └─ run-context.ts       sdílený kontext běhu
├─ fixtures/test.ts           rozšířený `test`, importuje ho každý spec
├─ tests/
│  ├─ smoke/  regression/  e2e/  negative/
│  └─ unit/                   self-testy sanitizéru a verifieru
├─ scripts/
│  ├─ sanitize-artifacts.ts   redakce tokenu v reportu a trace
│  ├─ verify-no-secrets.ts    blokující kontrola před uploadem
│  ├─ account-preflight.ts    kapacita účtu, fail fast
│  ├─ account-cleanup.ts      nouzový úklid, dry-run by default
│  └─ ci-summary.ts           job summary pro GitHub Actions
├─ docs/
│  ├─ architecture.md         tento dokument
│  ├─ test-catalog.md         registr TC → úroveň → soubor → stav
│  ├─ manual-tests.md         co se testuje ručně a proč
│  ├─ adr/                    zvážená a odložená rozhodnutí
│  └─ runbooks/token-rotation.md
├─ global-setup.ts            ověření tokenu, orphan sweep, kapacita
├─ global-teardown.ts         doúklid resources tohoto běhu
├─ playwright.config.ts
├─ .env.example               jména proměnných, nikdy hodnoty
├─ .gitignore                 včetně temp/ kvůli HAR
├─ README.md  CONTRIBUTING.md  CLAUDE.md
```

---

## První kroky

Bylo rozhodnuto, že i dokument architektury jde do repa přes Issue → větev → PR. Pořadí:

1. **One-time setup repa** (bez toho nejde dodržet pravidlo 15.1 ani pro první PR): ruleset na `main`, GitHub Environments `production` a `staging`, secret, labely, CODEOWNERS, issue a PR templates, `CONTRIBUTING.md`, kostra README. Tenhle krok je vejce-slepice - dělá se jako první commit do prázdného main, protože branch protection nelze splnit dřív, než existuje.
2. **Issue + PR s dokumentem architektury** - `docs/architecture.md` vznikne z tohoto plánu. První PR, který projde novým workflow a rovnou ho tím ověří.
3. **Bezpečnostní vrstva** - `redact.ts`, `sanitize-artifacts.ts`, `verify-no-secrets.ts`, `artifacts-security.spec.ts`. **Dřív než jakýkoli upload artefaktu.**
4. **`_run-suite.yml` + `on-demand.yml`** - ověřit celý řetězec ručním během se **záměrně padajícím testem**, aby vznikl trace, a zkontrolovat stažený artefakt.
5. **`pr.yml`** + nastavení required checks (`Static checks`, `PR gate`).
6. **Wave 0 foundation** podle fázování výše.
7. **`smoke-hourly.yml`, `regression-daily.yml`, `cleanup-account.yml`** až když Wave 1 drží.
8. Summary reporter, failure-to-issue workflow, badge v README.

Kroky 1 a 2 jsou předpokladem workshopu. Kroky 3 až 5 musí být hotové dřív, než se cokoli nahraje jako artefakt do veřejného repa.

---

## Jak ověřit, že framework drží

Po každé fázi musí platit (převzato z acceptance criteria Wave 0 v katalogu):

1. `npm ci && npm test` projde lokálně na čerstvém klonu podle README bez doptávání
2. **Dvojí běh za sebou nechá účet ve stejném stavu** - ověřitelné `npm run account:preflight` před a po
3. `git grep -iE '[0-9a-f]{40}'` nenajde v repu žádný token
4. `npm run test:unit` projde, včetně self-testu sanitizéru a verifieru
5. Ruční běh on-demand workflow se **záměrně padajícím testem** → stáhnout artefakt → rozbalit `trace.zip` → potvrdit, že token v něm není
6. `npm run typecheck && npm run lint && npm run format:check` bez chyb

---

## Rizika a otevřené otázky

### Rizika

| Riziko | Dopad | Opatření |
|---|---|---|
| Playwright změní formát reportu/trace a sanitizér přestane fungovat tiše | **Kritický** - token na veřejném internetu natrvalo | Blokující verifier + jeho vlastní unit testy; Dependabot PR na Playwright projde static jobem, který ten test spouští |
| Token v úkrytu trace, na který jsme nepomysleli | **Kritický** | Tvarový regex nezávislý na přesné hodnotě + krátká retention |
| **Orphan sweep běží na něčím osobním účtu** | **Kritický pro účastníka** - cena chyby je smazaný osobní projekt, ne jen červená pipeline | Maže se výhradně podle prefixu `QA <runId>`; projekt s prefixem, ale nečitelným runId, se nikdy nemaže, jen hlásí; `account-cleanup.ts` má dry-run jako výchozí chování |
| Suite předpokládá něco o obsahu účtu | Vysoký - náhodně červené testy na zaneřáděném osobním účtu | Vynutit v review: žádná aserce na délku seznamu ani na celkové počty; vždy hledat podle id, nikdy podle pozice; `list*` musí projít celou paginaci; Inbox není prázdný; aserce "nic navíc" se omezují na data tohoto běhu |
| `max_projects: 5` na účtu, který už není prázdný | Vysoký - lokálně větší riziko než na servisním účtu, účastník může mít pět vlastních projektů | `globalSetup` čte `max_projects` z `user_plan_limits` (nehardcoduje - někdo může mít Pro), porovná po orphan sweepu a skončí s hláškou "účet drží 5 projektů z 5, uvolni jeden" |
| Různé timezone a jazyky napříč účty účastníků | Střední - posune, co vrátí `due.string` | Timezone účtu se čte v `globalSetup`, loguje do reportu, aserce v TC-11 až TC-13 jsou relativní vůči ní. Hardcodované kalendářní datum je v review důvod k zamítnutí |
| Sufixy `.N` u rozpadlých TC se rozejdou s katalogem | Nízký, ale zákeřný | Konvence váže sufix na pořadí odrážky v acceptance criteria, takže přeskládání odrážek v katalogu rozbije dohledatelnost. Ohlídat při každé změně katalogu |
| **UC-E2E je blokovaný externí dodávkou** | Střední - Wave 3 se bez HARu nezačíná | Musí být v plánu vidět jako závislost, ne jako překvapení v den workshopu |
| Agent běží pod identitou člověka | Vysoký, procesní | Oddělená identita - první issue v repu |
| Soft-deleted tasky se počítají do `max_tasks: 300` | **Vysoký provozní** - účet se při hodinovém smoke zaplní během dní a suite začne padat naráz | Ověřit ve Wave 0, případně trvalé mazání přes `/sync` |
| Vyčerpání limitu 5 projektů souběžnými běhy | Vysoký, blokuje všechny běhy | Preflight fail-fast, segmentované concurrency, denní janitor |
| `cancel-in-progress: true` ruší PR běh před teardownem | Střední | `cleanup-account.yml` maže data starší než 2 h |
| **GitHub po 60 dnech nečinnosti scheduled workflow automaticky vypne** | Vysoký a zákeřný - neprojeví se červeným během, prostě přestane existovat | Badge v README ukazuje stáří posledního běhu; postup znovuzapnutí v runbooku |
| Nedokumentované rate limity, 24 smoke + PR běhy na jednom účtu | Střední, nevysvětlitelné flaky | Defenzivní backoff s `Retry-After`, 1 worker, serializovaný scheduled provoz |
| Flakiness u testů závislých na "dnes" (TC-11, TC-13) | Střední | Všechny aserce relativní (nové datum je později než staré, den v týdnu je pondělí), nikdy absolutní kalendářní datum |
| Artefakt už byl stažen, než se únik odhalil | Vysoký | Rotace je jediná účinná reakce; mazání artefaktů nic neodvolá - musí to být v runbooku natvrdo |
| HAR s cookies commitnutý do veřejného repa | Vysoký | `temp/` v `.gitignore`, explicitní řádek v CONTRIBUTING |

### Otevřené otázky

**Technické, k zodpovězení ve Wave 0:**
1. Je `DELETE /projects/{id}` hard nebo soft delete? Ovlivňuje TC-03, TC-21 a spolehlivost cleanupu.
2. Počítají se soft-deleted tasky do `max_tasks: 300`?
3. Vynechávají `GET /tasks` a `GET /projects` soft-deleted položky samy, nebo musíme filtrovat?
4. Potvrdit cesty `/sections`, `/comments`, `/labels` proti aktuální dokumentaci, ne odhadovat.

**Procesní, k rozhodnutí před spuštěním CI:**
5. **Dostane agent vlastní GitHub identitu?** Bez toho je "agent nemerguje" nevynutitelné.
6. **Je servisní účet pro CI vyhrazený, nebo je to něčí reálný Todoist?** Pokud reálný, dopad případného úniku i dopad testovacích dat je úplně jiný.
7. **Bude mít CI servisní účet Free, nebo placený plán?** Odpověď rozhoduje o stropu paralelizace.
8. **Kdy bude k dispozici `temp/todoist-e2e.har`?** Blokuje Wave 3 a Wave 5.
9. **Opravdu smoke 24x denně?** Na produkčním účtu to je 24 cyklů zakládání a mazání projektu denně navíc k regresi a PR běhům. Alternativa: každou hodinu 7:00-19:00 v pracovní dny, tedy ~65 běhů týdně místo 168. Feedback loop zůstane hodinový tehdy, kdy ho někdo čte.
10. **Draft PR bez live sady - souhlas?** Šetří kapacitu účtu, ale je to odchylka od doslovného "v každém PR po každém commitu".
11. **Kdo dostane notifikaci při červené scheduled pipeline?** Dnes nikdo. Minimum: workflow, které při selhání založí nebo aktualizuje issue. Jinak hodinová smoke nikoho neinformuje.
12. **Kdo schvaluje rozšíření katalogu,** když review ve Wave 5 najde něco, co si zaslouží test? Předpoklad: Lucie nebo Anastasiya, agent si ID nevymýšlí.
13. **Existuje reálně testovací prostředí Todoistu?** Podle toho se rozhodne, jestli `environments.ts` obsahuje konkrétní URL, nebo jen čte proměnnou.

Poznámka k rate limitům: s dvanácti účastníky běžícími suite proti **vlastním** účtům se nedokumentované limity násobí per uživatel, takže workshopový provoz je z tohohle pohledu bezpečnější než jeden sdílený účet. Tlak zůstává jen na servisním účtu v CI.
