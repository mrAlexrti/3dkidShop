# OFFLINE ONLY: definitions, synthetic evidence and process settings; never main.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$path=Join-Path $PSScriptRoot 'operator/batch18-backup-restore.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Backup PowerShell syntax invalid.'}
foreach($definition in $ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){. ([scriptblock]::Create($definition.Extent.Text))}
Import-BackupSafetyHelpers $repository
$passed=0
function Check([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Pass([string]$Message){$script:passed++;Write-Output "PASS backup offline $script:passed`: $Message"}
function Rejects([scriptblock]$Action,[string]$Code=''){
 $failed=$false;try{& $Action|Out-Null}catch{$failed=$true;if($Code){Check ($_.Exception.Message -ceq ('B18_BACKUP_'+$Code)) 'Wrong failure code.'}}
 Check $failed 'Expected fail-closed rejection.'
}
Pass 'PowerShell parsed; exact captured helper source imported by named definitions only; no collector main.'
$root=Get-BackupRoot;$directory=Join-Path $root ('20261122T170000Z_'+('a'*32))
Check ((Assert-BackupDirectory $directory) -ceq $directory) 'Valid unique artifact directory rejected.'
foreach($bad in @($repository,(Join-Path $root '..\outside'),(Join-Path $root 'old-backup'),(Join-Path $root ('20261122T170000Z_'+('a'*32)+'\nested')))){Rejects {Assert-BackupDirectory $bad} 'ARTIFACT_DIRECTORY_REFUSED'}
Check (-not $root.StartsWith($repository,[StringComparison]::OrdinalIgnoreCase)) 'Backup destination is inside repository.'
Pass 'Fixed outside-Git artifact root; traversal, nested, existing-name and repository targets rejected.'
$script:OwnedDatabases=[Collections.Generic.HashSet[string]]::new();$db='batch18_backup_verify_'+('b'*32)
foreach($bad in @('restore_3dkid_batch18','neondb','postgres',$db)){Rejects {Assert-BackupOwnedDatabase $bad} 'UNOWNED_RESTORE_TARGET'}
[void]$script:OwnedDatabases.Add($db);Assert-BackupOwnedDatabase $db
Rejects {Assert-BackupOwnedDatabase ('batch18_backup_verify_'+('c'*32))} 'UNOWNED_RESTORE_TARGET'
Pass 'Only current-process unique disposable DB names are writable; baseline, Neon and unowned names refused.'
$script:PgBin='C:\Program Files\PostgreSQL\18\bin'
$script:WorkDirectory='';$script:RootCertificatePath=''
foreach($tool in @('psql','pg_dump','pg_restore')){
 $info=New-BackupClient $tool @('--version') None $null
 Check ($info.Arguments -ceq '"--version"' -and -not $info.EnvironmentVariables.ContainsKey('PGPASSWORD') -and -not $info.EnvironmentVariables.ContainsKey('PGPASSFILE')) 'Version checks require a work directory or credentials.'
}
Rejects {New-BackupClient pg_restore @('-d','neondb') None $null} 'CONNECTIONLESS_COMMAND_REQUIRED'
$fixture=Join-Path $repository ('.next\cache\batch18-backup-offline-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture);$script:WorkDirectory=$fixture
$script:RootCertificatePath=Join-Path $fixture 'trusted-roots.pem'
[IO.File]::WriteAllText($script:RootCertificatePath,'SYNTHETIC PUBLIC CA PLACEHOLDER')
$secret=ConvertTo-SecureString 'SYNTHETIC_SECRET_DO_NOT_PRINT' -AsPlainText -Force;$info=$null
try{
 $info=New-BackupClient pg_dump @('-d','neondb','--format=custom','--snapshot=00000001-00000002-1') Neon $secret
 Check ($info.Arguments -match '"-h" "ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech" "-p" "5432" "-U" "neondb_owner"' -and $info.Arguments -notmatch 'SYNTHETIC_SECRET') 'Remote target changed or credential became an argument.'
 Check ($info.EnvironmentVariables['PGPASSWORD'] -ceq 'SYNTHETIC_SECRET_DO_NOT_PRINT' -and $info.EnvironmentVariables['PGSSLMODE'] -ceq 'verify-full' -and $info.EnvironmentVariables['PGSSLROOTCERT'] -ceq $script:RootCertificatePath -and $info.EnvironmentVariables['PGOPTIONS'] -match 'default_transaction_read_only=on') 'Strict TLS/RO/credential policy missing.'
 Check (-not $info.UseShellExecute -and $info.CreateNoWindow -and $info.EnvironmentVariables['PGPASSFILE'].EndsWith('DO-NOT-CREATE.pgpass')) 'Visible shell or existing credential-file fallback.'
 Clear-PreflightClient $info;Check (-not $info.EnvironmentVariables.ContainsKey('PGPASSWORD')) 'Credential cleanup failed.'
 Rejects {New-BackupClient pg_restore @('-d','neondb') Neon $secret} 'REMOTE_WRITE_REFUSED'
 Rejects {New-BackupClient psql @('-d','neondb') Neon $secret $false} 'REMOTE_WRITE_REFUSED'
 Rejects {New-BackupClient pg_dump @('-d','postgres') Neon $secret} 'REMOTE_DATABASE_REFUSED'
 Rejects {New-BackupClient pg_dump @('-d','neondb','--host=wrong') Neon $secret} 'CONNECTION_OVERRIDE_REFUSED'
 Rejects {New-BackupClient pg_restore @('-d','restore_3dkid_batch18') Local $secret $false} 'UNOWNED_RESTORE_TARGET'
 Rejects {New-BackupClient pg_restore @('-d',$db,'--clean') Local $secret $false} 'DESTRUCTIVE_RESTORE_OPTION'
 $info=New-BackupClient pg_restore @('-d',$db,'--single-transaction','--exit-on-error','--no-owner','--no-privileges') Local $secret $false
 Check ($info.Arguments -match '"-h" "127.0.0.1" "-p" "55432"' -and $info.EnvironmentVariables['PGHOSTADDR'] -ceq '127.0.0.1' -and $info.EnvironmentVariables['PGOPTIONS'] -match 'log_statement=none' -and $info.EnvironmentVariables['PGOPTIONS'] -match 'log_min_error_statement=panic') 'Local connection/logging protection missing.'
}finally{if($info){Clear-PreflightClient $info};$secret.Dispose()}
Pass 'Constructed clients only: hardcoded endpoints, strict remote TLS/RO, child-only secrets, no overrides/remote restore, owned local writes and private logging.'
$fingerprint=Get-BackupFingerprintSql $repository;$sql=Get-BackupEvidenceSql $fingerprint
Check ($fingerprint -match '^SELECT md5' -and $sql -match 'WITH fingerprint AS' -and $sql -match 'jsonb_agg\(to_jsonb\(t\) ORDER BY id COLLATE "C"\)' -and $sql -match "timezone='UTC'" -and $sql -match "datestyle='ISO,YMD'") 'Comparable deterministic evidence missing.'
Check (($sql -split 'AS digest FROM public.').Count-1 -eq 14) 'Not all fourteen tables digested.'
Check (($sql -split 'p.id IS NULL').Count-1 -eq 11) 'Not all eleven existing FK relationships checked.'
Check ($sql -notmatch '(?im)^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COPY|GRANT|REVOKE)\b') 'Evidence query writes data.'
Pass 'Pinned fingerprint reused; fourteen table counts/full-row aggregate digests and eleven orphan checks; timezone-stable read-only SQL.'
$counts=[ordered]@{};$digests=[ordered]@{}
foreach($table in @('Account','Category','Order','OrderItem','OrderNotification','Product','ProductAttribute','ProductImage','ProductOption','ProductOptionValue','Review','Session','SiteContent','User')){$counts[$table]=0;$digests[$table]='d'*32}
$counts.Product=6;$counts.Category=5;$counts.ProductImage=19;$counts.ProductOption=1;$counts.ProductOptionValue=2
$fixtureEvidence=[ordered]@{SchemaFingerprint='c7068acb15096ec556a1d5e1e80ec559';Counts=$counts;Digests=$digests;Tables=14;Columns=149;Indexes=31;ForeignKeys=11;Constraints=113;UserTriggers=0;InvalidObjects=0;Orphans=0;LedgerAbsent=$true}
function EvidenceLine($Value){return 'B18_EVIDENCE='+($Value|ConvertTo-Json -Depth 6 -Compress)}
$expected=Convert-BackupEvidence (EvidenceLine $fixtureEvidence)
foreach($field in @('SchemaFingerprint','Tables','Columns','Indexes','ForeignKeys','Constraints','UserTriggers','InvalidObjects','Orphans','LedgerAbsent')){
 $old=$fixtureEvidence[$field];$fixtureEvidence[$field]=if($field -eq 'SchemaFingerprint'){'0'*32}elseif($field -eq 'LedgerAbsent'){$false}else{-1}
 try{Rejects {Convert-BackupEvidence (EvidenceLine $fixtureEvidence)}}finally{$fixtureEvidence[$field]=$old}
}
$counts.Product=5;try{Rejects {Convert-BackupEvidence (EvidenceLine $fixtureEvidence)} 'CURRENT_CATALOG_CHANGED_REVIEW_REQUIRED'}finally{$counts.Product=6}
$digests.Product='PRIVATE_ROW';try{Rejects {Convert-BackupEvidence (EvidenceLine $fixtureEvidence)} 'TABLE_EVIDENCE_INVALID'}finally{$digests.Product='d'*32}
Pass 'Schema drift, ledger appearance, orphans, malformed hashes and regression to five-product backup fail closed.'
$actual=Convert-BackupEvidence (EvidenceLine $fixtureEvidence);Assert-BackupEvidenceEqual $expected $actual
$actual.Digests.Product='e'*32;Rejects {Assert-BackupEvidenceEqual $expected $actual} 'RESTORED_RECORDS_DIFFER';$actual.Digests.Product='d'*32
$actual.Counts.ProductImage=18;Rejects {Assert-BackupEvidenceEqual $expected $actual} 'RESTORED_RECORDS_DIFFER'
$counts.Product=7;$counts.ProductImage=23;[void](Convert-BackupEvidence (EvidenceLine $fixtureEvidence));$counts.Product=6;$counts.ProductImage=19
Pass 'Restore equality rejects changed product data and lost dependent images; backup accepts newer catalog growth without forcing old counts.'
$remote=Get-BackupRemoteGuard;$local=Get-BackupLocalGuard 'postgres'
foreach($token in @('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','neondb_owner','180007','pg_foreign_table','pg_event_trigger','pg_extension','ACCESS SHARE')){Check ($remote.Contains($token)) 'Remote identity/DDL-race/external-object guard missing.'}
foreach($token in @('127.0.0.1','55432','180007','3dkid-pg18-restore','current_database()','postgres')){Check ($local.Contains($token)) 'Exact local identity guard missing.'}
Check ((Get-BackupLocalGuard $db).Contains($db)) 'Owned database guard missing.'
Rejects {Get-BackupLocalGuard 'restore_3dkid_batch18'} 'UNOWNED_RESTORE_TARGET'
Pass 'Exact server, database, role, version and local data-directory guards; remote DDL/external-object defenses preserved.'
Check (Test-BackupPublicSchemaEntry '5; 2615 2200 SCHEMA - public neondb_owner') 'Public schema creation TOC entry not detected.'
Check (-not (Test-BackupPublicSchemaEntry '6; 0 0 COMMENT - SCHEMA public neondb_owner')) 'Comment mistaken for schema creation.'
Check (-not (Test-BackupPublicSchemaEntry '5; 2615 2200 SCHEMA - public_other neondb_owner')) 'Unrelated schema mistaken for public.'
$emptySchema=Get-BackupEmptySchemaSql $db
Check ($emptySchema.Contains($db) -and $emptySchema.Contains('B18_BACKUP_PUBLIC_NOT_EMPTY') -and $emptySchema -match 'pg_class' -and $emptySchema -match 'pg_proc' -and $emptySchema -match 'DROP SCHEMA public;' -and $emptySchema -notmatch 'DROP SCHEMA[^;]*CASCADE') 'Empty local schema guard missing.'
Rejects {Get-BackupEmptySchemaSql 'restore_3dkid_batch18'} 'UNOWNED_RESTORE_TARGET'
Rejects {Get-BackupEmptySchemaSql 'neondb'} 'UNOWNED_RESTORE_TARGET'
Pass 'TOC-driven public-schema recreation handles owner differences only in a brand-new guarded empty local database, without CASCADE.'
$archive=Join-Path $fixture 'synthetic.dump';$bytes=New-Object byte[] 1024
[Array]::Copy([Text.Encoding]::ASCII.GetBytes('PGDMP'),$bytes,5);[IO.File]::WriteAllBytes($archive,$bytes)
$hash=(Get-FileHash -LiteralPath $archive).Hash.ToLowerInvariant();Assert-BackupArchive $archive $hash
Rejects {Assert-BackupArchive $archive ('0'*64)} 'ARCHIVE_HASH_MISMATCH'
$bytes[0]=0;[IO.File]::WriteAllBytes($archive,$bytes);Rejects {Assert-BackupArchive $archive ''} 'CUSTOM_FORMAT_REQUIRED'
Pass 'Synthetic archive envelope only: custom magic, minimum size and SHA tampering rejection; not proof of pg_restore readability.'
$source=[IO.File]::ReadAllText($path)
$export=$source.IndexOf("SELECT 'B18_SNAPSHOT='||pg_export_snapshot();")
$dump=$source.IndexOf("New-BackupClient pg_dump @('-d','neondb'")
$commit=$source.IndexOf("`$keeper.StandardInput.WriteLine('COMMIT;')")
Check ($export -gt 0 -and $export -lt $dump -and $dump -lt $commit -and $source.Contains("('--snapshot='+`$snapshot)")) 'Dump/evidence snapshot lifetime broken.'
Check ($source.Contains('[IO.File]::Move($partial,$archive)') -and $source -match 'BACKUP_ALREADY_EXISTS' -and $source -match 'ARCHIVE_HASH_MISMATCH') 'Overwrite/interruption guards missing.'
Check ($source -notmatch '(?i)DROP DATABASE|--disable-triggers|--clean.*New-BackupClient|Start-Transcript|Write-Host[^\r\n]+\$(secret|stderr|stdout)|\$env:PG\w*\s*=|pg_restore.+Neon.+\$false') 'Unsafe destruction, logging, parent credentials or remote restore found.'
Check ($source -match 'BACKUP CURRENT NEON neondb' -and $source -match 'RESTORE NEW LOCAL ONLY' -and $source -match 'secret.Dispose' -and $source -match 'keeper.Kill' -and $source -match 'MigrationApproved=\$false') 'Approval/finally/never-migration separation missing.'
Pass 'Exported snapshot held through dump; no overwrite/auto-cleanup; separate confirmations, fail-closed process cleanup and no migration approval.'
function New-KeeperFixture([string]$Output,[string]$Diagnostic,[int]$ExitCode=3){
 $reader=[IO.StringReader]::new($Output);$errReader=[IO.StringReader]::new($Diagnostic)
 $process=[pscustomobject]@{StandardOutput=$reader;ExitCode=$ExitCode}
 $process|Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {param($timeout) return $true}
 return [pscustomobject]@{Process=$process;ErrorTask=$errReader.ReadToEndAsync();Reader=$reader;ErrorReader=$errReader}
}
# Reproduce the old opaque EOF failure entirely in memory. No subprocess or DB.
foreach($case in @(
 @('TARGET_VERIFICATION','ERROR:  B18B1','TARGET_REJECTED','B18B1'),
 @('OBJECT_SCOPE_CHECK','ERROR:  B18B2','OBJECT_SCOPE_REJECTED','B18B2'),
 @('TABLE_LOCKS','ERROR:  55P03','SQL_55P03','55P03'),
 @('EVIDENCE_CAPTURE','ERROR:  42601','SQL_42601','42601'),
 @('SNAPSHOT_EXPORT','ERROR:  42501','SQL_42501','42501')
)){
 $script:BackupOperation='CONNECT';$script:BackupFailure=$null
 $keeperFixture=New-KeeperFixture ("B18_STEP="+$case[0]+"`n") ($case[1]+': PRIVATE_SQL postgresql://PRIVATE:SECRET@invalid/customer')
 try{
  Rejects {Read-BackupKeeperLine $keeperFixture.Process 'B18_EVIDENCE=' $keeperFixture.ErrorTask} ('CLIENT_'+$case[2])
  Check ($script:BackupFailure.Operation -ceq $case[0] -and $script:BackupFailure.ClientExitCode -eq 3 -and $script:BackupFailure.SqlState -ceq $case[3]) 'EOF lost exact attempted step/exit/SQLSTATE.'
  Check (($script:BackupFailure|ConvertTo-Json -Compress) -notmatch 'PRIVATE|SECRET|postgresql|customer') 'Raw stderr leaked.'
 }finally{$keeperFixture.Reader.Dispose();$keeperFixture.ErrorReader.Dispose()}
}
$script:BackupOperation='CONNECT'
$keeperFixture=New-KeeperFixture '' 'SSL error: certificate verify failed: PRIVATE'
try{Rejects {Read-BackupKeeperLine $keeperFixture.Process 'B18_EVIDENCE=' $keeperFixture.ErrorTask} 'CLIENT_TLS_CHAIN_VERIFICATION_FAILED';Check ($script:BackupFailure.Operation -ceq 'CONNECT') 'TLS error blamed a SQL step.'}finally{$keeperFixture.Reader.Dispose();$keeperFixture.ErrorReader.Dispose()}
$keeperFixture=New-KeeperFixture '' '' 0
try{Rejects {Read-BackupKeeperLine $keeperFixture.Process 'B18_EVIDENCE=' $keeperFixture.ErrorTask} 'CLIENT_EXIT_WITHOUT_RESULT'}finally{$keeperFixture.Reader.Dispose();$keeperFixture.ErrorReader.Dispose()}
Pass 'In-memory opaque EOF reproduction now distinguishes TLS/target/scope/locks/evidence/export failures with sanitized SQLSTATE and client exit code.'
$script:BackupOperation='CONNECT'
$keeperFixture=New-KeeperFixture "B18_STEP=TARGET_VERIFICATION`nB18_STEP=EVIDENCE_CAPTURE`nB18_EVIDENCE=synthetic`nB18_STEP=SNAPSHOT_EXPORT`nB18_SNAPSHOT=00000001-00000002-1`n" '' 0
try{
 Check ((Read-BackupKeeperLine $keeperFixture.Process 'B18_EVIDENCE=' $keeperFixture.ErrorTask) -ceq 'B18_EVIDENCE=synthetic') 'Step markers broke evidence framing.'
 Check ((Read-BackupKeeperLine $keeperFixture.Process 'B18_SNAPSHOT=' $keeperFixture.ErrorTask) -ceq 'B18_SNAPSHOT=00000001-00000002-1' -and $script:BackupOperation -ceq 'SNAPSHOT_EXPORT') 'Export framing or operation incorrect.'
}finally{$keeperFixture.Reader.Dispose();$keeperFixture.ErrorReader.Dispose()}
foreach($output in @("`n",'B18_STEP=PRIVATE_SECRET','PRIVATE_CUSTOMER_ROW')){
 $keeperFixture=New-KeeperFixture $output 'ERROR:  42601: PRIVATE' 3
 try{Rejects {Read-BackupKeeperLine $keeperFixture.Process 'B18_SNAPSHOT=' $keeperFixture.ErrorTask} 'CLIENT_UNEXPECTED_OUTPUT';Check ($script:BackupFailure.SqlState -ceq '42601') 'Unexpected stdout discarded available SQLSTATE.'}finally{$keeperFixture.Reader.Dispose();$keeperFixture.ErrorReader.Dispose()}
}
$timeout=Get-BackupClientFailure 'PG_DUMP' $null '' 'TIMEOUT'
Check ($timeout.Operation -ceq 'PG_DUMP' -and $timeout.Category -ceq 'TIMEOUT') 'Dump timeout not distinguishable.'
$close=Get-BackupClientFailure 'SNAPSHOT_CLOSE' 3 'ERROR:  25P02: PRIVATE'
Check ($close.Operation -ceq 'SNAPSHOT_CLOSE' -and $close.SqlState -ceq '25P02') 'Close error misclassified.'
Check ((Get-BackupClientFailure 'PRIVATE_OPERATION' 1 'PRIVATE_STDERR').Operation -ceq 'CLIENT') 'Arbitrary operation leaked.'
Pass 'Step framing succeeds; blank/unknown/private stdout still fails closed; dump/close/timeouts remain distinct without exposing raw diagnostics.'
$targetGuard=($remote -split "SELECT 'B18_STEP=TARGET_VERIFICATION';")[1] -split "SELECT 'B18_STEP=OBJECT_SCOPE_CHECK';"
$targetGuard=$targetGuard[0] -replace '(?m)--[^\r\n]*',''
Check ($targetGuard -notmatch 'pg_stat_ssl|pg_backend_pid' -and ([regex]::Matches($targetGuard,'\bIF\s+(?!;)')).Count -eq 5) 'Backend-hop SSL still acts as a client TLS gate, or a legitimate target check was removed.'
foreach($condition in @(
 @("current_database\(\)<>'neondb'",'B18C1','TARGET_DATABASE_MISMATCH'),
 @("current_user::text<>'neondb_owner'",'B18C2','TARGET_ROLE_MISMATCH'),
 @('pg_is_in_recovery\(\)','B18C3','TARGET_IS_REPLICA'),
 @("current_setting\('server_version_num'\)::int<>180007",'B18C4','TARGET_VERSION_MISMATCH'),
 @("current_setting\('transaction_read_only'\)<>'on'",'B18C5','TARGET_NOT_READ_ONLY')
)){
 Check ($targetGuard -match ('IF '+$condition[0]+"\s+THEN RAISE EXCEPTION USING ERRCODE='"+$condition[1]+"'")) 'A target condition no longer rejects with its exact distinct SQLSTATE.'
 $failure=Get-BackupClientFailure 'TARGET_VERIFICATION' 3 ('ERROR:  '+$condition[1]+': PRIVATE')
 Check ($failure.Category -ceq $condition[2] -and $failure.SqlState -ceq $condition[1] -and $failure.ClientExitCode -eq 3) 'Specific target cause lost in sanitized report.'
}
# Synthetic proxy topology: all identity predicates false; backend TLS false.
# Demonstrates the OLD predicate's false positive, not a live Neon observation.
$identityMismatch=$false;$backendHopUsesTls=$false
Check (($identityMismatch -or -not $backendHopUsesTls) -and -not $identityMismatch) 'Synthetic proxy counterexample invalid.'
Check ($source.Contains("`$info.EnvironmentVariables['PGSSLMODE']='verify-full';`$info.EnvironmentVariables['PGSSLROOTCERT']=`$script:RootCertificatePath") -and $source.Contains("Stop-Backup 'ROOT_BUNDLE_REQUIRED'")) 'Client certificate/hostname verification or CA requirement was weakened.'
Pass 'Proxy TLS counterexample: backend SSL is not a client-security gate; all five exact identity/state rejections and strict libpq TLS/CA controls remain.'
Remove-Item -LiteralPath $archive,$script:RootCertificatePath -Force
[IO.Directory]::Delete($fixture)
Write-Output "PASS backup/restore OFFLINE: $passed groups. PREPARED only; no process launch, credentials, database, backup, restore or network."
