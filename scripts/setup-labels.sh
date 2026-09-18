#!/usr/bin/env bash
# Creates the repository labels. Run once, with the gh CLI authenticated.
set -euo pipefail

create() {
  gh label create "$1" --color "$2" --description "$3" --force
}

create 'type/bug'             'd73a4a' 'Something in the framework or the pipeline is broken'
create 'type/feature'         'a2eeef' 'New capability of the framework'
create 'type/task'            'c5def5' 'Framework, CI or documentation work'
create 'type/tests'           '0e8a16' 'A test case from the catalog'
create 'type/ci'              'fbca04' 'Pipelines and automation'
create 'type/docs'            '0075ca' 'Documentation only'

create 'area/framework'       'ededed' 'Client, resources, fixtures, schemas'
create 'area/tests'           'ededed' 'Test specifications'
create 'area/ci'              'ededed' 'Workflows and scripts'

create 'risk/security'        'b60205' 'Touches secrets, artifacts or permissions'
create 'blocked'              '5319e7' 'Waiting on something outside this repository'
create 'needs-human-decision' 'e99695' 'An agent must not resolve this alone'
