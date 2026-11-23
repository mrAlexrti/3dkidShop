# OPERATOR ONLY. Preparation is not authorization to run this script.
# Never transcribe/dot-source. No URLs/passwords as parameters. No migration logic.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('Backup','Restore')][string]$Mode,
      [string]$RunDirectory='')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$VerbosePreference='SilentlyContinue';$DebugPreference='SilentlyContinue'

function Stop-Backup([string]$Code){throw [InvalidOperationException]::new('B18_BACKUP_'+$Code)}
function Get-BackupClientFailure([string]$Operation,$ClientExitCode,[string]$Diagnostic,[ValidateSet('CLIENT','TIMEOUT','PROTOCOL')][string]$Kind='CLIENT'){
    # Fixed identifiers only. Never retain stderr, SQL, stdout, URLs or peer data.
    if($Operation -cnotin @('CLIENT','CLIENT_VERSION','CONNECT','BEGIN_TRANSACTION','TARGET_VERIFICATION','OBJECT_SCOPE_CHECK','TABLE_LOCKS','EVIDENCE_CAPTURE','SNAPSHOT_EXPORT','PG_DUMP','SNAPSHOT_CLOSE','ARCHIVE_LIST')){$Operation='CLIENT'}
    $state='';$category='EXIT_WITHOUT_RESULT'
    if($Diagnostic -match '\b(?:ERROR|FATAL):\s+([A-Z0-9]{5})\b'){$state=$Matches[1]}
    if($Kind -eq 'TIMEOUT'){$category='TIMEOUT'}
    elseif($Kind -eq 'PROTOCOL'){$category='UNEXPECTED_OUTPUT'}
    elseif($state -ceq 'B18B1'){$category='TARGET_REJECTED'}
    elseif($state -ceq 'B18C1'){$category='TARGET_DATABASE_MISMATCH'}
    elseif($state -ceq 'B18C2'){$category='TARGET_ROLE_MISMATCH'}
    elseif($state -ceq 'B18C3'){$category='TARGET_IS_REPLICA'}
    elseif($state -ceq 'B18C4'){$category='TARGET_VERSION_MISMATCH'}
    elseif($state -ceq 'B18C5'){$category='TARGET_NOT_READ_ONLY'}
    elseif($state -ceq 'B18B2'){$category='OBJECT_SCOPE_REJECTED'}
    elseif($state){$category='SQL_'+$state}
    elseif($Diagnostic){$category=Get-PreflightClientError $Diagnostic}
    if($null -ne $ClientExitCode -and [string]$ClientExitCode -cnotmatch '^-?\d{1,10}$'){$ClientExitCode=$null}
    return [pscustomobject]@{Operation=$Operation;ClientExitCode=$ClientExitCode;SqlState=$state;Category=$category}
}
function Stop-BackupClientFailure([string]$Operation,$ClientExitCode,[string]$Diagnostic,[string]$Kind='CLIENT'){
    $script:BackupFailure=Get-BackupClientFailure $Operation $ClientExitCode $Diagnostic $Kind
    Stop-Backup ('CLIENT_'+$script:BackupFailure.Category)
}
function Import-BackupSafetyHelpers([string]$Repository){
    # Import ONLY named definitions from the exact tested collector, never its main.
    $path=Join-Path $Repository 'scripts/operator/batch18-production-preflight.ps1'
    $bytes=[IO.File]::ReadAllBytes($path);$sha=[Security.Cryptography.SHA256]::Create()
    try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    if($hash -cne 'ba54b4c49b8438787930bfcfac812b046c2f792510c33d0699ea94f88d804d20'){Stop-Backup 'HELPER_REVIEW_REQUIRED'}
    $text=[Text.Encoding]::UTF8.GetString($bytes)
    $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors)
    if($errors.Count){Stop-Backup 'HELPER_SYNTAX'}
    foreach($name in @('Stop-Preflight','Get-TextHash','New-PrivatePreflightDirectory','Convert-PreflightArguments','Convert-PreflightRootCertificates','Get-PreflightWindowsRoots','Get-PreflightClientError','Clear-PreflightClient')){
        $definition=@($ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $name},$true))
        if($definition.Count -ne 1){Stop-Backup 'HELPER_DEFINITION'}
        # Explicit script scope; importing does not launch a process or prompt.
        $declaration=$definition[0].Extent.Text -replace ('^function\s+'+[regex]::Escape($name)),('function script:'+$name)
        . ([scriptblock]::Create($declaration))
    }
}
function Get-BackupRoot {return Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) '3dkid-batch18-production-backups'}
function Assert-BackupDirectory([string]$Path){
    $absolute=[IO.Path]::GetFullPath($Path).TrimEnd('\');$root=[IO.Path]::GetFullPath((Get-BackupRoot)).TrimEnd('\')
    if([IO.Path]::GetDirectoryName($absolute) -ine $root -or [IO.Path]::GetFileName($absolute) -cnotmatch '^\d{8}T\d{6}Z_[a-f0-9]{32}$'){Stop-Backup 'ARTIFACT_DIRECTORY_REFUSED'}
    foreach($candidate in @($root,$absolute)){
        if((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){Stop-Backup 'REPARSE_POINT_REFUSED'}
    }
    return $absolute
}
function Assert-BackupOwnedDatabase([string]$Database){
    if($Database -cnotmatch '^batch18_backup_verify_[a-f0-9]{32}$' -or -not $script:OwnedDatabases.Contains($Database)){Stop-Backup 'UNOWNED_RESTORE_TARGET'}
}
function New-BackupClient([string]$Tool,[string[]]$Arguments,[ValidateSet('None','Neon','Local')][string]$Target,[Security.SecureString]$Password,[bool]$ReadOnly=$true){
    if($Tool -cnotin @('psql','pg_dump','pg_restore')){Stop-Backup 'TOOL_REFUSED'}
    if($Target -eq 'None' -and -not (($Arguments.Count -eq 1 -and $Arguments[0] -ceq '--version') -or ($Tool -ceq 'pg_restore' -and $Arguments.Count -eq 2 -and $Arguments[0] -ceq '--list'))){Stop-Backup 'CONNECTIONLESS_COMMAND_REQUIRED'}
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $script:PgBin ($Tool+'.exe')
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.RedirectStandardInput=$true
    $args=@()
    if($Target -ne 'None'){
        $dbPosition=[Array]::IndexOf($Arguments,'-d')
        if($dbPosition -lt 0 -or $dbPosition+1 -ge $Arguments.Count){Stop-Backup 'EXPLICIT_DATABASE_REQUIRED'}
        $database=$Arguments[$dbPosition+1]
        if($Target -eq 'Neon' -and $database -cne 'neondb'){Stop-Backup 'REMOTE_DATABASE_REFUSED'}
        if($Target -eq 'Local' -and $database -cne 'postgres'){Assert-BackupOwnedDatabase $database}
        foreach($argument in $Arguments){if($argument -match '^(?:-h|-p|-U|--host|--port|--username|--dbname)(?:=|$)|postgres(?:ql)?://'){Stop-Backup 'CONNECTION_OVERRIDE_REFUSED'}}
        $hostName=if($Target -eq 'Neon'){'ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech'}else{'127.0.0.1'}
        $port=if($Target -eq 'Neon'){'5432'}else{'55432'};$role=if($Target -eq 'Neon'){'neondb_owner'}else{'postgres'}
        if($Target -eq 'Neon' -and (-not $ReadOnly -or $Tool -eq 'pg_restore')){Stop-Backup 'REMOTE_WRITE_REFUSED'}
        $args=@('-h',$hostName,'-p',$port,'-U',$role,'-w')
    }
    if($Target -eq 'Local' -and $Tool -eq 'pg_restore'){
        $position=[Array]::IndexOf($Arguments,'-d')
        if($position -lt 0 -or $position+1 -ge $Arguments.Count){Stop-Backup 'RESTORE_DATABASE_REQUIRED'}
        Assert-BackupOwnedDatabase $Arguments[$position+1]
        if($Arguments -ccontains '--create' -or $Arguments -ccontains '--clean'){Stop-Backup 'DESTRUCTIVE_RESTORE_OPTION'}
    }
    $info.Arguments=Convert-PreflightArguments ($args+$Arguments)
    foreach($key in @($info.EnvironmentVariables.Keys)){if($key -like 'PG*' -or $key -in @('DATABASE_URL','DIRECT_URL','SSL_CERT_FILE','SSL_CERT_DIR')){$info.EnvironmentVariables.Remove($key)}}
    $info.EnvironmentVariables['LC_ALL']='C';$info.EnvironmentVariables['PGCLIENTENCODING']='UTF8'
    $info.EnvironmentVariables['PGCONNECT_TIMEOUT']='10';$info.EnvironmentVariables['PGAPPNAME']='3dkid_batch18_backup_verification'
    if($Target -ne 'None'){$info.EnvironmentVariables['PGPASSFILE']=Join-Path $script:WorkDirectory 'DO-NOT-CREATE.pgpass'}
    $readMode=if($ReadOnly){'on'}else{'off'}
    $info.EnvironmentVariables['PGOPTIONS']="-c default_transaction_read_only=$readMode -c search_path=pg_catalog -c lock_timeout=5s -c statement_timeout=120s -c idle_in_transaction_session_timeout=600s -c client_min_messages=error"
    if($Target -eq 'Neon'){
        if(-not [IO.File]::Exists($script:RootCertificatePath)){Stop-Backup 'ROOT_BUNDLE_REQUIRED'}
        $info.EnvironmentVariables['PGSSLMODE']='verify-full';$info.EnvironmentVariables['PGSSLROOTCERT']=$script:RootCertificatePath
    }elseif($Target -eq 'Local'){
        $info.EnvironmentVariables['PGHOSTADDR']='127.0.0.1';$info.EnvironmentVariables['PGSSLMODE']='disable'
        # Local restore may contain private data. Suppress SQL/parameter/error-row logging.
        $info.EnvironmentVariables['PGOPTIONS']+=' -c log_statement=none -c log_min_duration_statement=-1 -c log_min_error_statement=panic -c log_min_messages=panic -c log_error_verbosity=terse -c log_parameter_max_length=0 -c log_parameter_max_length_on_error=0'
    }
    if($Target -ne 'None'){
        if(-not $Password -or $Password.Length -eq 0){Stop-Backup 'PASSWORD_REQUIRED'}
        $pointer=[IntPtr]::Zero;$plain=$null
        try{$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password);$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer);$info.EnvironmentVariables['PGPASSWORD']=$plain}
        catch{Clear-PreflightClient $info;throw}
        finally{$plain=$null;if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}}
    }
    return $info
}
function Invoke-BackupClient($Info,[string]$Sql='', [int]$Timeout=600000){
    $process=[Diagnostics.Process]::new();$process.StartInfo=$Info;$started=$false
    try{
        $started=$process.Start();$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
        if($Sql){$process.StandardInput.WriteLine($Sql)};$process.StandardInput.Close()
        if(-not $process.WaitForExit($Timeout)){$process.Kill();Stop-BackupClientFailure $script:BackupOperation $null '' 'TIMEOUT'}
        $stdout=$out.GetAwaiter().GetResult();$stderr=$err.GetAwaiter().GetResult()
        if($process.ExitCode -ne 0){Stop-BackupClientFailure $script:BackupOperation $process.ExitCode $stderr}
        return $stdout
    }finally{if($started -and -not $process.HasExited){$process.Kill()};$process.Dispose();Clear-PreflightClient $Info;$stderr=$null;$stdout=$null}
}
function Get-BackupFingerprintSql([string]$Repository){
    $path=Join-Path $Repository 'docs/release/batch-1.8-production-preflight.sql'
    $bytes=[IO.File]::ReadAllBytes($path);$sha=[Security.Cryptography.SHA256]::Create()
    try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    if($hash -cne '64139191343df170888a22af34f298cebd5fe61d8064d9b313ab7362791e0284'){Stop-Backup 'SQL_REVIEW_REQUIRED'}
    $text=[Text.Encoding]::UTF8.GetString($bytes)
    $block=($text -split '-- B18_SCHEMA_FINGERPRINT_BEGIN')[1] -split '-- B18_SCHEMA_FINGERPRINT_END'
    return $block[0].Trim().TrimEnd(';')
}
function Get-BackupEvidenceSql([string]$FingerprintSql){
    $tables=@('Account','Category','Order','OrderItem','OrderNotification','Product','ProductAttribute','ProductImage','ProductOption','ProductOptionValue','Review','Session','SiteContent','User')
    $rows=foreach($table in $tables){
        # Aggregate hashes only: no IDs, names, descriptions, credentials or customer rows leave SQL.
        "SELECT '$table' AS name,count(*)::bigint AS n,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id COLLATE `"C`")::text,'[]')) AS digest FROM public.`"$table`" t"
    }
    $references=@(@('Account','userId','User'),@('Session','userId','User'),@('Category','parentId','Category'),@('Product','categoryId','Category'),@('ProductImage','productId','Product'),@('ProductOption','productId','Product'),@('ProductOptionValue','optionId','ProductOption'),@('ProductAttribute','productId','Product'),@('OrderNotification','orderId','Order'),@('OrderItem','orderId','Order'),@('OrderItem','productId','Product'))
    $orphans=foreach($reference in $references){'SELECT count(*)::bigint AS n FROM public."'+$reference[0]+'" c LEFT JOIN public."'+$reference[2]+'" p ON p.id=c."'+$reference[1]+'" WHERE c."'+$reference[1]+'" IS NOT NULL AND p.id IS NULL'}
    return @"
SET LOCAL search_path=pg_catalog;
SET LOCAL timezone='UTC';
SET LOCAL datestyle='ISO,YMD';
SET LOCAL extra_float_digits=3;
WITH fingerprint AS ($FingerprintSql), records AS ($($rows -join ' UNION ALL ')), orphans AS ($($orphans -join ' UNION ALL '))
SELECT 'B18_EVIDENCE='||json_build_object(
 'SchemaFingerprint',(SELECT schema_fingerprint FROM fingerprint),
 'Counts',(SELECT jsonb_object_agg(name,n ORDER BY name) FROM records),
 'Digests',(SELECT jsonb_object_agg(name,digest ORDER BY name) FROM records),
 'Tables',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')),
 'Columns',(SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped),
 'Indexes',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace),
 'ForeignKeys',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f'),
 'Constraints',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace),
 'UserTriggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal),
 'InvalidObjects',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace AND (NOT i.indisvalid OR NOT i.indisready))+(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated),
 'Orphans',(SELECT sum(n) FROM orphans),
 'LedgerAbsent',to_regclass('public._prisma_migrations') IS NULL)::text;
"@
}
function Convert-BackupEvidence([string]$Line){
    if($Line.Length -gt 32768 -or -not $Line.StartsWith('B18_EVIDENCE=')){Stop-Backup 'EVIDENCE_FORMAT'}
    $value=$Line.Substring(13) | ConvertFrom-Json
    $expected=@('SchemaFingerprint','Counts','Digests','Tables','Columns','Indexes','ForeignKeys','Constraints','UserTriggers','InvalidObjects','Orphans','LedgerAbsent')
    if((@($value.PSObject.Properties.Name|Sort-Object) -join '|') -cne (($expected|Sort-Object) -join '|')){Stop-Backup 'EVIDENCE_KEYS'}
    if($value.SchemaFingerprint -cne 'c7068acb15096ec556a1d5e1e80ec559' -or $value.LedgerAbsent -isnot [bool] -or $value.LedgerAbsent -ne $true){Stop-Backup 'BASELINE_DRIFT'}
    $objects=@{Tables=14;Columns=149;Indexes=31;ForeignKeys=11;Constraints=113;UserTriggers=0;InvalidObjects=0;Orphans=0}
    foreach($key in $objects.Keys){if([string]$value.$key -cne [string]$objects[$key]){Stop-Backup 'SCHEMA_OR_RELATIONSHIP_DIFFERS'}}
    $tables=@('Account','Category','Order','OrderItem','OrderNotification','Product','ProductAttribute','ProductImage','ProductOption','ProductOptionValue','Review','Session','SiteContent','User')
    foreach($group in @('Counts','Digests')){
        if((@($value.$group.PSObject.Properties.Name|Sort-Object) -join '|') -cne (($tables|Sort-Object) -join '|')){Stop-Backup 'TABLE_KEYS'}
        foreach($table in $tables){$pattern=if($group -eq 'Counts'){'^\d{1,12}$'}else{'^[a-f0-9]{32}$'};if([string]$value.$group.$table -cnotmatch $pattern){Stop-Backup 'TABLE_EVIDENCE_INVALID'}}
    }
    if([long]$value.Counts.Product -lt 6 -or [long]$value.Counts.ProductImage -lt 19 -or [long]$value.Counts.Category -lt 5 -or [long]$value.Counts.ProductOption -lt 1 -or [long]$value.Counts.ProductOptionValue -lt 2){Stop-Backup 'CURRENT_CATALOG_CHANGED_REVIEW_REQUIRED'}
    return $value
}
function Assert-BackupEvidenceEqual($Expected,$Actual){
    foreach($name in @('SchemaFingerprint','Tables','Columns','Indexes','ForeignKeys','Constraints','UserTriggers','InvalidObjects','Orphans','LedgerAbsent')){if([string]$Expected.$name -cne [string]$Actual.$name){Stop-Backup 'RESTORED_SCHEMA_DIFFERS'}}
    foreach($table in $Expected.Counts.PSObject.Properties.Name){
        if([string]$Expected.Counts.$table -cne [string]$Actual.Counts.$table -or $Expected.Digests.$table -cne $Actual.Digests.$table){Stop-Backup 'RESTORED_RECORDS_DIFFER'}
    }
}
function Get-BackupRemoteGuard {
    return @'
SELECT 'B18_STEP=BEGIN_TRANSACTION';
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT 'B18_STEP=TARGET_VERIFICATION';
DO $b18backup$ BEGIN
 IF current_database()<>'neondb'
 THEN RAISE EXCEPTION USING ERRCODE='B18C1',MESSAGE='B18_BACKUP_DATABASE_MISMATCH'; END IF;
 IF current_user::text<>'neondb_owner'
 THEN RAISE EXCEPTION USING ERRCODE='B18C2',MESSAGE='B18_BACKUP_ROLE_MISMATCH'; END IF;
 IF pg_is_in_recovery()
 THEN RAISE EXCEPTION USING ERRCODE='B18C3',MESSAGE='B18_BACKUP_REPLICA'; END IF;
 IF current_setting('server_version_num')::int<>180007
 THEN RAISE EXCEPTION USING ERRCODE='B18C4',MESSAGE='B18_BACKUP_VERSION_MISMATCH'; END IF;
 IF current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION USING ERRCODE='B18C5',MESSAGE='B18_BACKUP_NOT_READ_ONLY'; END IF;
 -- TLS is enforced by libpq verify-full and the explicit Windows CA bundle.
 -- pg_stat_ssl describes the backend hop, not client-to-Neon-proxy TLS.
END $b18backup$;
SELECT 'B18_STEP=OBJECT_SCOPE_CHECK';
DO $b18backup$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_foreign_table) OR EXISTS(SELECT 1 FROM pg_event_trigger)
 OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('S','v','m','f'))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (c.relrowsecurity OR c.relforcerowsecurity))
 OR EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('public','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','v','m','f','S'))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('public','information_schema') AND n.nspname NOT LIKE 'pg_%')
 THEN RAISE EXCEPTION USING ERRCODE='B18B2',MESSAGE='B18_BACKUP_EXTERNAL_OBJECT_REVIEW'; END IF;
END $b18backup$;
SELECT 'B18_STEP=TABLE_LOCKS';
-- ACCESS SHARE only, held until snapshot closes: DDL cannot race evidence/dump.
LOCK TABLE public."Account",public."Category",public."Order",public."OrderItem",public."OrderNotification",public."Product",public."ProductAttribute",public."ProductImage",public."ProductOption",public."ProductOptionValue",public."Review",public."Session",public."SiteContent",public."User" IN ACCESS SHARE MODE;
SELECT 'B18_STEP=EVIDENCE_CAPTURE';
'@
}
function Get-BackupLocalGuard([string]$Database){
    if($Database -cne 'postgres'){Assert-BackupOwnedDatabase $Database}
    return @"
DO `$b18local`$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432
 OR current_database()<>'$Database' OR current_user::text<>'postgres' OR pg_is_in_recovery()
 OR current_setting('server_version_num')::int<>180007
 OR lower(rtrim(replace(current_setting('data_directory'),chr(92),'/'),'/'))<>'c:/users/alexa/appdata/local/3dkid-pg18-restore'
 THEN RAISE EXCEPTION USING ERRCODE='B18B3',MESSAGE='B18_BACKUP_WRONG_LOCAL_SERVER'; END IF;
END `$b18local`$;
"@
}
function Stop-BackupKeeperFailure($Process,$ErrorTask,[string]$Kind){
    $exitCode=$null;$diagnostic=''
    if($Process.WaitForExit(5000)){$exitCode=$Process.ExitCode;if($ErrorTask -and $ErrorTask.Wait(5000)){$diagnostic=$ErrorTask.GetAwaiter().GetResult()}}
    Stop-BackupClientFailure $script:BackupOperation $exitCode $diagnostic $Kind
}
function Read-BackupKeeperLine($Process,[string]$Prefix,$ErrorTask){
    while($true){
        $task=$Process.StandardOutput.ReadLineAsync()
        if(-not $task.Wait(130000)){Stop-BackupClientFailure $script:BackupOperation $null '' 'TIMEOUT'}
        $line=$task.GetAwaiter().GetResult()
        if($null -eq $line){
            Stop-BackupKeeperFailure $Process $ErrorTask 'CLIENT'
        }
        if($line -cmatch '^B18_STEP=(BEGIN_TRANSACTION|TARGET_VERIFICATION|OBJECT_SCOPE_CHECK|TABLE_LOCKS|EVIDENCE_CAPTURE|SNAPSHOT_EXPORT)$'){$script:BackupOperation=$Matches[1];continue}
        if(-not $line.StartsWith($Prefix)){Stop-BackupKeeperFailure $Process $ErrorTask 'PROTOCOL'}
        return $line
    }
}
function Assert-BackupArchive([string]$Path,[string]$Hash){
    if(-not [IO.File]::Exists($Path) -or ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-Item -LiteralPath $Path).Length -lt 1024){Stop-Backup 'ARCHIVE_MISSING_OR_INVALID'}
    $stream=[IO.File]::OpenRead($Path)
    try{$magic=New-Object byte[] 5;if($stream.Read($magic,0,5) -ne 5 -or [Text.Encoding]::ASCII.GetString($magic) -cne 'PGDMP'){Stop-Backup 'CUSTOM_FORMAT_REQUIRED'}}finally{$stream.Dispose()}
    if($Hash -and ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Hash)){Stop-Backup 'ARCHIVE_HASH_MISMATCH'}
}
function Test-BackupPublicSchemaEntry([string]$Toc){
    return [regex]::IsMatch($Toc,'(?m)^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\s+[^\r\n]+\r?$')
}
function Get-BackupEmptySchemaSql([string]$Database){
    Assert-BackupOwnedDatabase $Database
    return (Get-BackupLocalGuard $Database)+@'

DO $b18empty$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
 THEN RAISE EXCEPTION USING ERRCODE='B18B4',MESSAGE='B18_BACKUP_PUBLIC_NOT_EMPTY'; END IF;
END $b18empty$;
-- Only a brand-new, verified, empty, owned local DB. No CASCADE ever.
DROP SCHEMA public;
'@
}

# MAIN: offline tests import definitions only. Nothing runs merely by parsing.
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:PgBin='C:\Program Files\PostgreSQL\18\bin';$script:OwnedDatabases=[Collections.Generic.HashSet[string]]::new()
$script:WorkDirectory='';$script:RootCertificatePath='';$secret=$null;$keeper=$null;$keeperInfo=$null;$keeperStarted=$false;$keeperErrors=$null
$script:BackupOperation='CLIENT_VERSION';$script:BackupFailure=$null
$exitCode=1;$reportPath='';$report=[ordered]@{Status='BLOCKED';Mode=$Mode;StartedUtc=[DateTime]::UtcNow.ToString('o');ErrorCode='';BackupCreated=$false;RestoreVerified=$false;MigrationApproved=$false;Database='';CompletedUtc=''}
try{
    Import-BackupSafetyHelpers $repository
    $fingerprint=Get-BackupFingerprintSql $repository;$evidenceSql=Get-BackupEvidenceSql $fingerprint
    $migrationHash=(Get-FileHash -LiteralPath (Join-Path $repository 'docs/release/batch-1.8-production-migration.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
    if($migrationHash -cne '94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84'){Stop-Backup 'MIGRATION_REVIEW_REQUIRED'}
    $report['ReviewedMigrationSha256']=$migrationHash
    $report['ReferencePreflightRun']='d7684441a5ac425ea66b678b3e601d5e'
    $report['ReferencePreflightReportSha256']='9da26d330884c362d547b867f1153e38c3f4a7ba1f308a94dbb78834de86e9ab'
    $versions=[ordered]@{}
    foreach($tool in @('psql','pg_dump','pg_restore')){
        $info=New-BackupClient $tool @('--version') None $null
        $version=(Invoke-BackupClient $info).Trim()
        if($version -cnotmatch ('^'+[regex]::Escape($tool)+' \(PostgreSQL\) 18\.7$')){Stop-Backup 'PG18_7_TOOLS_REQUIRED'};$versions[$tool]='18.7'
    }
    $report['ToolVersions']=$versions
    if($Mode -eq 'Backup'){
        if($RunDirectory){Stop-Backup 'BACKUP_DESTINATION_NOT_CUSTOMIZABLE'}
        if((Read-Host 'After owner approval, confirm active StikerSuite/production/neondb/public endpoint and writers reviewed: type BACKUP CURRENT NEON neondb') -cne 'BACKUP CURRENT NEON neondb'){Stop-Backup 'BACKUP_APPROVAL_REQUIRED'}
        $id=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'_'+[guid]::NewGuid().ToString('N')
        $RunDirectory=Assert-BackupDirectory (Join-Path (Get-BackupRoot) $id)
        New-PrivatePreflightDirectory $RunDirectory;$script:WorkDirectory=$RunDirectory
        $reportPath=Join-Path $RunDirectory 'backup-result.json'
        $script:RootCertificatePath=Join-Path $RunDirectory 'trusted-roots.pem';$roots=Get-PreflightWindowsRoots
        [IO.File]::WriteAllText($script:RootCertificatePath,$roots.Pem,[Text.UTF8Encoding]::new($false))
        $report['Tls']=[ordered]@{Mode='verify-full';TrustSource='WINDOWS_CURRENTUSER_AND_LOCALMACHINE_ROOT';CertificateCount=$roots.CertificateCount;BundleSha256=$roots.Sha256};$roots=$null
        $secret=Read-Host 'NEON neondb_owner password (secure; never paste into chat)' -AsSecureString
        $keeperInfo=New-BackupClient psql @('-X','-q','-A','-t','-d','neondb','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate') Neon $secret
        $script:BackupOperation='CONNECT'
        $keeper=[Diagnostics.Process]::new();$keeper.StartInfo=$keeperInfo;$keeperStarted=$keeper.Start();$keeperErrors=$keeper.StandardError.ReadToEndAsync()
        $keeper.StandardInput.AutoFlush=$true
        $keeper.StandardInput.WriteLine((Get-BackupRemoteGuard)+"`n"+$evidenceSql+"`nSELECT 'B18_STEP=SNAPSHOT_EXPORT';`nSELECT 'B18_SNAPSHOT='||pg_export_snapshot();")
        $evidence=Convert-BackupEvidence (Read-BackupKeeperLine $keeper 'B18_EVIDENCE=' $keeperErrors)
        $snapshot=(Read-BackupKeeperLine $keeper 'B18_SNAPSHOT=' $keeperErrors).Substring(13)
        if($snapshot -cnotmatch '^[A-F0-9]{8}-[A-F0-9]{8}-[0-9]+$'){Stop-Backup 'SNAPSHOT_ID_INVALID'}
        $report['SnapshotCapturedUtc']=[DateTime]::UtcNow.ToString('o')
        $partial=Join-Path $RunDirectory 'neondb.dump.partial';$archive=Join-Path $RunDirectory 'neondb.dump'
        if([IO.File]::Exists($partial) -or [IO.File]::Exists($archive)){Stop-Backup 'BACKUP_ALREADY_EXISTS'}
        $script:BackupOperation='PG_DUMP'
        $info=New-BackupClient pg_dump @('-d','neondb','--format=custom','--compress=gzip:6',('--snapshot='+$snapshot),'--lock-wait-timeout=5s',('--file='+$partial)) Neon $secret
        [void](Invoke-BackupClient $info)
        # Complete the exporting transaction only AFTER pg_dump has finished.
        $script:BackupOperation='SNAPSHOT_CLOSE'
        $keeper.StandardInput.WriteLine('COMMIT;');$keeper.StandardInput.Close()
        if(-not $keeper.WaitForExit(30000)){Stop-BackupClientFailure $script:BackupOperation $null '' 'TIMEOUT'}
        if($keeper.ExitCode -ne 0){Stop-BackupClientFailure $script:BackupOperation $keeper.ExitCode ($keeperErrors.GetAwaiter().GetResult())}
        Assert-BackupArchive $partial ''
        $script:BackupOperation='ARCHIVE_LIST'
        [void](Invoke-BackupClient (New-BackupClient pg_restore @('--list',$partial) None $null))
        [IO.File]::Move($partial,$archive) # Never overwrite: Move throws if destination exists.
        $report['Archive']='neondb.dump';$report['ArchiveSha256']=(Get-FileHash -LiteralPath $archive).Hash.ToLowerInvariant()
        $report['ArchiveBytes']=(Get-Item -LiteralPath $archive).Length;$report['Evidence']=$evidence
        $report['Target']=[ordered]@{Project='StikerSuite';Branch='production';Host='ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech';Database='neondb';Schema='public';Role='neondb_owner';SharedDatabase=$true}
        $report.BackupCreated=$true;$report.Status='BACKUP_CREATED';$exitCode=0
    }else{
        if(-not $RunDirectory){Stop-Backup 'BACKUP_DIRECTORY_REQUIRED'}
        $RunDirectory=Assert-BackupDirectory $RunDirectory
        $manifestPath=Join-Path $RunDirectory 'backup-result.json'
        if((Get-Item -LiteralPath $manifestPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){Stop-Backup 'REPARSE_POINT_REFUSED'}
        if((Get-Item -LiteralPath $manifestPath).Length -gt 131072){Stop-Backup 'REPORT_TOO_LARGE'}
        $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if($manifest.Status -cne 'BACKUP_CREATED' -or $manifest.BackupCreated -ne $true -or $manifest.Archive -cne 'neondb.dump' -or $manifest.ArchiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or $manifest.Target.Host -cne 'ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech' -or $manifest.Target.Database -cne 'neondb' -or $manifest.Tls.Mode -cne 'verify-full'){Stop-Backup 'BACKUP_REPORT_INVALID'}
        $expected=Convert-BackupEvidence ('B18_EVIDENCE='+($manifest.Evidence|ConvertTo-Json -Depth 6 -Compress))
        $archive=Join-Path $RunDirectory 'neondb.dump';Assert-BackupArchive $archive $manifest.ArchiveSha256
        if((Read-Host 'Confirm isolated LOCAL restore only; no app/integrations will run: type RESTORE NEW LOCAL ONLY') -cne 'RESTORE NEW LOCAL ONLY'){Stop-Backup 'RESTORE_APPROVAL_REQUIRED'}
        $restoreId=[guid]::NewGuid().ToString('N');$work=Join-Path $RunDirectory ('restore_'+$restoreId)
        New-PrivatePreflightDirectory $work;$script:WorkDirectory=$work;$reportPath=Join-Path $work 'restore-result.json'
        $secret=Read-Host 'LOCAL postgres password (secure; not Neon password)' -AsSecureString
        $db='batch18_backup_verify_'+$restoreId
        $guard=Get-BackupLocalGuard 'postgres'
        $create=$guard+"`nCREATE DATABASE `"$db`" WITH TEMPLATE template0;"
        [void](Invoke-BackupClient (New-BackupClient psql @('-X','-q','-A','-t','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate') Local $secret $false) $create)
        [void]$script:OwnedDatabases.Add($db);$report.Database=$db
        # Unique database was created by THIS process, is empty, and is never reused.
        Assert-BackupOwnedDatabase $db
        $guard=Get-BackupLocalGuard $db
        $empty=$guard+"`nSELECT 'B18_EMPTY='||(count(*)=0)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');"
        $raw=Invoke-BackupClient (New-BackupClient psql @('-X','-q','-A','-t','-d',$db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate') Local $secret) $empty
        if($raw.Trim() -cne 'B18_EMPTY=true'){Stop-Backup 'RESTORE_TARGET_NOT_EMPTY'}
        $toc=Invoke-BackupClient (New-BackupClient pg_restore @('--list',$archive) None $null)
        # pg_dump may include CREATE SCHEMA public when ownership differs from
        # template0. Remove ONLY that empty local schema if the TOC recreates it.
        if(Test-BackupPublicSchemaEntry $toc){
            [void](Invoke-BackupClient (New-BackupClient psql @('-X','-q','-A','-t','-d',$db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate') Local $secret $false) (Get-BackupEmptySchemaSql $db))
        }
        $toc=$null
        Assert-BackupOwnedDatabase $db
        [void](Invoke-BackupClient (New-BackupClient pg_restore @('-d',$db,'--single-transaction','--exit-on-error','--no-owner','--no-privileges',$archive) Local $secret $false))
        $raw=Invoke-BackupClient (New-BackupClient psql @('-X','-q','-A','-t','-d',$db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate') Local $secret) ($guard+"`nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;`n"+$evidenceSql+"`nCOMMIT;")
        $actual=Convert-BackupEvidence ($raw.Trim());Assert-BackupEvidenceEqual $expected $actual
        Assert-BackupArchive $archive $manifest.ArchiveSha256
        $report['SourceArchiveSha256']=$manifest.ArchiveSha256;$report['Evidence']=$actual;$report['OwnerAclRestoreTested']=$false
        $report.BackupCreated=$true;$report.RestoreVerified=$true;$report.Status='RESTORE_VERIFIED';$exitCode=0
    }
}catch{
    $code=$_.Exception.Message;if($code -cnotmatch '^B18_(?:BACKUP|PREFLIGHT)_[A-Z0-9_]+$'){$code='B18_BACKUP_CHECK_FAILED'}
    $report.ErrorCode=$code;Write-Host ('BLOCKED: '+$code+' (raw diagnostics suppressed; preserve all artifacts/databases)')
    $report['FailedOperation']=$script:BackupOperation
    if($script:BackupFailure){$report['ClientFailure']=$script:BackupFailure}
}finally{
    if($keeper){if($keeperStarted -and -not $keeper.HasExited){$keeper.Kill()};$keeper.Dispose()}
    if($keeperInfo){Clear-PreflightClient $keeperInfo};if($secret){$secret.Dispose();$secret=$null}
    $report.CompletedUtc=[DateTime]::UtcNow.ToString('o')
    try{
        if($script:RootCertificatePath -and [IO.File]::Exists($script:RootCertificatePath)){[IO.File]::Delete($script:RootCertificatePath)}
        if($reportPath){[IO.File]::WriteAllText($reportPath,($report|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false));Write-Host ('Sanitized report: '+$reportPath)}
    }catch{$exitCode=1;Write-Host 'BLOCKED: report write or public-CA cleanup failed.'}
    Write-Host ('Result: '+$report.Status+'; exit code: '+$exitCode)
    Write-Host 'No migration/deployment approval. Archives contain private data; never share archives or raw database output.'
}
exit $exitCode
