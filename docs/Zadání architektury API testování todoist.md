# Plán architektury testování API todoist

Co by měl obsahovat plán architektury:

1. Struktura repozitáře (architektura)  
   1. Follow best practices   
   2. Page object model  
   3. Samostatné repo pro automatizované testy, není spolu s kódem aplikace  
2. Prostředí   
   1. PROD: https://app.todoist.com/api/v1/    
   2. Ale připrav to tak, aby bylo možné přepnout i na test prostředí  
3. API docs  
   1. [https://developer.todoist.com/api/v1/](https://developer.todoist.com/api/v1/)   
4. Readme   
   1. Musí obsahovat instrukce jak nainstalovat a spustit  
5. Úrovně testování  
   1. Smoke testy jako první  
   2. Potom hlavní regresní scénáře \- happy paths a hlavní alternativní scénáře  
   3. E2E scénáře  
   4. A až potom malý subset negativních  
   5. Specifikovat jasně, které testy se musí provést manuálně  
6. Technologický stack   
   1. playwright \+ typescript  
7. Scope testování  
   1. API testing na jednom uživateli  
   2. Neděláme performance testy  
8. Jaké části aplikace chceme testovat (co je pro byznys důležité)  
   1. Soustředíme se na tasky, termíny a projekty \- to jsou pro byznys nejdůležitější funkce  
   2. Do budoucna budeme rozšiřovat i na další funkce aplikace  
9. CI/CD pipelines (GitHub actions) \- schedule, artifacts, env  
   1. Smoke testy 1x za hodinu  
   2. Regresní 1x za den \- 16:00  
   3. \+ možnost spustit on demand  
   4. V každém Pull requestu spouštěj celou sadu testů po každém commitu  
   5. Artefakty \- standardní playwright report v html \+ traces  
   6. Zatím spouštěj testy jen v 1 vlákně, neparalelizuj \- ale už to připrav tak, abychom v budoucnu mohli testy spouštět paralelně  
10. Samotný design testů \- naming conventions, jak se mají testy psát, členění na steps, fixtures…  
    1. Každý test bude mít v názvu číslo testu z test management systemu  
    2. Kód, komentáře a dokumentace budou psané anglicky  
    3. Členění testů na kroky  
    4. DRY principle  
    5. KISS principle  
    6. Piš stručné komentáře na místa kódu, která nejsou self-explaining. U jednoduchých částí kódu komentáře nepřidávej.   
    7. Atomic testy  
    8. Logy nám stačí z playwright reportu  
    9. Pro přihlašování budeme používat api token z todoistu  
    10. Cleanup \- po každém testu si po sobě ukliď  
11. Reporting  
    1. Nyní budeme sledovat hlavně výsledky na github actions pipelines  
    2. Do budoucna budeme používat Allure report, ale až později  
12. Cíle automatizace testování \- proč automatizujeme. Pokud repo už existuje, tak co s ním chceme dál dělat a jakým směrem ho rozšiřovat.  
    1. Rychlá zpětná vazba, jestli aplikace funguje \- smoke testy  
    2. Odlehčit manuálním testerům při regresním testování  
13. Co nechceme automatizovat a proč  
    1. Neautomatizuj nastavení, protože se bude zanedlouho měnit schéma api této funkce  
    2. Neautomatizuj placené funkce, testujeme pouze free verzi  
14. Test data   
    1. Používej github secrets   
    2. Nedávej hesla a tokeny do repozitáře  
    3. Používej api token který ti předám  
    4. Používej pouze jednoho uživatele pro testování  
    5. Před každým testem si připrav data, nebo je připravuj v rámci testu. Pokud se ti nepodaří připravit data tak to komunikuj (ne silent fail).  
15. Pravidla collaboration  
    1. Na každou změnu Issue v GitHubu, vlastní větev z main, Pull request  
    2. Nemergovat a necommitovat přímo do main větve  
    3. AI agent nesmí mergovat PR, schvaluje pouze Lucie nebo Anastasiya  
    4. Po skončení práce na tasku chci aby mi agent dal:  
       1. Odkaz na issue  
       2. Odkaz na Pull Request  
       3. Srozumitelný přehled změn, které se v PR provedly  
       4. Rizika, věci k dořešení

    

    