# OPERATOR ONLY. Read-only Neon metadata collection; never dot-source/transcribe.
# All parameters are NONSECRET. Password is prompted securely, never an argument.
[CmdletBinding()]
param(
    [switch]$SharedDatabase,
    [string]$ProjectName='', [string]$BranchName='',
    [string]$ProjectId='', [string]$BranchId='', [string]$DirectHost='',
    [string]$Database='', [string]$AuditRole='', [string]$MigrationRole='', [string]$ApplicationRole='',
    [string]$VercelHost='', [string]$VercelDatabase='', [string]$VercelRole='', [string]$VercelSchema='',
    [string]$DeployedCommit='', [string]$BaselineFingerprint=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'; $VerbosePreference='SilentlyContinue'; $DebugPreference='SilentlyContinue'

function Stop-Preflight([string]$Code) { throw [InvalidOperationException]::new('B18_PREFLIGHT_'+$Code) }
function Get-TextHash([string]$Value) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Read-VerifiedPreflightSql([string]$Path) {
    # Hash and execute the SAME captured bytes, even if the file changes while
    # the operator is confirming the target or entering a password.
    $bytes=[IO.File]::ReadAllBytes($Path);$sha=[Security.Cryptography.SHA256]::Create()
    try{$actual=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    if($actual -cne '64139191343df170888a22af34f298cebd5fe61d8064d9b313ab7362791e0284'){Stop-Preflight 'READONLY_SQL_HASH_REVIEW_REQUIRED'}
    return [Text.Encoding]::UTF8.GetString($bytes)
}
function Assert-Target($Target) {
    $shared=$Target.PSObject.Properties['SharedDatabase'] -and $Target.SharedDatabase
    if ($shared) {
        if($Target.ProjectName -cne 'StikerSuite' -or $Target.BranchName -cne 'production'){Stop-Preflight 'CONFIRMED_SHARED_TARGET_MISMATCH'}
        foreach($name in @('Database','VercelDatabase')){if($Target.$name -cne 'neondb'){Stop-Preflight 'CONFIRMED_SHARED_TARGET_MISMATCH'}}
        foreach($name in @('AuditRole','MigrationRole','ApplicationRole','VercelRole')){if($Target.$name -cne 'neondb_owner'){Stop-Preflight 'CONFIRMED_SHARED_TARGET_MISMATCH'}}
    }
    # Shared mode records confirmed display names, not invented provider IDs.
    # Generic mode still requires IDs; supplied IDs are always format-checked.
    if(((-not $shared -or $Target.ProjectId) -and $Target.ProjectId -cnotmatch '^[a-z0-9][a-z0-9-]{2,100}$') -or
       ((-not $shared -or $Target.BranchId) -and $Target.BranchId -cnotmatch '^br-[a-z0-9-]{4,100}$')){Stop-Preflight 'NEON_IDS_INVALID'}
    foreach($name in @('DirectHost','VercelHost')) {
        if ($Target.$name -cnotmatch '^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$') { Stop-Preflight 'HOSTNAME_ONLY_REQUIRED' }
    }
    if ($Target.DirectHost -match '-pooler\.') { Stop-Preflight 'DIRECT_ENDPOINT_REQUIRED' }
    if (($Target.VercelHost -replace '-pooler(?=\.)','') -cne $Target.DirectHost) { Stop-Preflight 'VERCEL_ENDPOINT_MISMATCH' }
    foreach($name in @('Database','AuditRole','MigrationRole','ApplicationRole','VercelDatabase','VercelRole')) {
        if ($Target.$name -cnotmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$') { Stop-Preflight 'TARGET_NAMES_INVALID' }
    }
    if ($Target.Database -cne $Target.VercelDatabase -or $Target.ApplicationRole -cne $Target.VercelRole -or $Target.VercelSchema -cne 'public') { Stop-Preflight 'VERCEL_DATABASE_ROLE_SCHEMA_MISMATCH' }
    if ($Target.DeployedCommit -cne '76621cf01ebe482bfee9a80aaed4a4b5b9dfed22') { Stop-Preflight 'ACTIVE_PRODUCTION_COMMIT_REVIEW_REQUIRED' }
    if ($Target.BaselineFingerprint -cnotmatch '^[a-f0-9]{32}$') { Stop-Preflight 'LOCAL_BASELINE_FINGERPRINT_REQUIRED' }
}
function Set-ConfirmedSharedDefaults($Values) {
    $defaults=@{ProjectName='StikerSuite';BranchName='production';Database='neondb';VercelDatabase='neondb';AuditRole='neondb_owner';MigrationRole='neondb_owner';ApplicationRole='neondb_owner';VercelRole='neondb_owner';VercelSchema='public'}
    foreach($name in $defaults.Keys){
        if(-not $Values[$name]){$Values[$name]=$defaults[$name]}
        elseif($Values[$name] -cne $defaults[$name]){Stop-Preflight 'CONFIRMED_SHARED_TARGET_MISMATCH'}
    }
}
function New-PrivatePreflightDirectory([string]$Path) {
    if (Test-Path -LiteralPath $Path) { Stop-Preflight 'OUTPUT_ALREADY_EXISTS' }
    [void][IO.Directory]::CreateDirectory($Path)
    $acl=[Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Convert-PreflightArguments([string[]]$Items) {
    return (($Items | ForEach-Object { if ($_ -match '["\r\n\x00]' -or $_.EndsWith('\')) { Stop-Preflight 'CLIENT_ARGUMENT_INVALID' }; '"'+$_+'"' }) -join ' ')
}
function Convert-PreflightRootCertificates([Security.Cryptography.X509Certificates.X509Certificate2[]]$Certificates) {
    # Only PUBLIC DER bytes from existing Windows ROOT stores. Never export keys,
    # trust a peer certificate, download a CA, or modify an OS certificate store.
    $roots=@{}
    foreach($certificate in $Certificates){
        $base64=[Convert]::ToBase64String($certificate.RawData)
        $roots[(Get-TextHash $base64)]=$base64
    }
    if($roots.Count -eq 0){Stop-Preflight 'TLS_WINDOWS_ROOT_STORE_EMPTY'}
    $pem=foreach($key in @($roots.Keys | Sort-Object)){
        "-----BEGIN CERTIFICATE-----`n"+([regex]::Replace($roots[$key],'.{1,64}','$0'+"`n"))+"-----END CERTIFICATE-----`n"
    }
    $text=$pem -join ''
    return [pscustomobject]@{Pem=$text;CertificateCount=$roots.Count;Sha256=(Get-TextHash $text)}
}
function Get-PreflightWindowsRoots {
    $certificates=[Collections.Generic.List[Security.Cryptography.X509Certificates.X509Certificate2]]::new()
    try {
        foreach($location in @('CurrentUser','LocalMachine')){
            $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root',[Security.Cryptography.X509Certificates.StoreLocation]$location)
            try {
                $store.Open([Security.Cryptography.X509Certificates.OpenFlags]'ReadOnly, OpenExistingOnly')
                foreach($certificate in $store.Certificates){$certificates.Add($certificate)}
            } finally {$store.Dispose()}
        }
        return Convert-PreflightRootCertificates $certificates.ToArray()
    } catch {
        if($_.Exception.Message -ceq 'B18_PREFLIGHT_TLS_WINDOWS_ROOT_STORE_EMPTY'){throw}
        Stop-Preflight 'TLS_WINDOWS_ROOT_STORE_UNAVAILABLE'
    } finally {foreach($certificate in $certificates){$certificate.Dispose()}}
}
function New-PreflightClient($Target,[string]$SqlFile,[Security.SecureString]$Password,[string]$RootCertificateFile) {
    Assert-Target $Target
    $expectedRoot=Join-Path ([IO.Path]::GetDirectoryName($SqlFile)) 'trusted-roots.pem'
    if(-not $RootCertificateFile -or [IO.Path]::GetFullPath($RootCertificateFile) -ine [IO.Path]::GetFullPath($expectedRoot) -or -not [IO.File]::Exists($RootCertificateFile)){Stop-Preflight 'TLS_ROOT_BUNDLE_REQUIRED'}
    $info=[Diagnostics.ProcessStartInfo]::new(); $info.FileName='C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $info.Arguments=Convert-PreflightArguments @('-X','-q','-w','--csv','-P','footer=off','-h',$Target.DirectHost,'-p','5432','-U',$Target.AuditRole,'-d',$Target.Database,
        '-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-v',('expected_database='+$Target.Database),'-v',('connection_role='+$Target.AuditRole),'-v',('application_role='+$Target.ApplicationRole),'-v',('migration_role='+$Target.MigrationRole),'-f',$SqlFile)
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    foreach($key in @($info.EnvironmentVariables.Keys)) { if ($key -like 'PG*' -or $key -in @('DATABASE_URL','DIRECT_URL','SSL_CERT_FILE','SSL_CERT_DIR')) { $info.EnvironmentVariables.Remove($key) } }
    # OpenSSL's "system" roots can be empty on Windows. Explicitly use the
    # run-private snapshot of Windows ROOT certificates; verification stays FULL.
    $info.EnvironmentVariables['PGSSLMODE']='verify-full'; $info.EnvironmentVariables['PGSSLROOTCERT']=$RootCertificateFile
    $info.EnvironmentVariables['LC_ALL']='C' # Stable diagnostics for fixed-code classification.
    $info.EnvironmentVariables['PGPASSFILE']=Join-Path ([IO.Path]::GetDirectoryName($SqlFile)) 'DO-NOT-CREATE.pgpass'
    $info.EnvironmentVariables['PGCONNECT_TIMEOUT']='10'; $info.EnvironmentVariables['PGCLIENTENCODING']='UTF8'
    $info.EnvironmentVariables['PGAPPNAME']='3dkid_batch18_readonly_preflight'
    $info.EnvironmentVariables['PGOPTIONS']='-c default_transaction_read_only=on -c statement_timeout=30s -c lock_timeout=5s -c search_path=pg_catalog -c client_min_messages=error'
    $pointer=[IntPtr]::Zero; $plain=$null
    try { $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password); $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer); $info.EnvironmentVariables['PGPASSWORD']=$plain }
    catch { Clear-PreflightClient $info; throw }
    finally { $plain=$null; if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)} }
    return $info
}
function Clear-PreflightClient($Info) { foreach($key in @($Info.EnvironmentVariables.Keys)){if($key -like 'PG*'){$Info.EnvironmentVariables.Remove($key)}} }
function Get-PreflightSections {
    return @{
      'database_name|connection_role|server_version|is_replica|read_only'='Identity'
      'schema_fingerprint'='Fingerprint'
      'table_name|owner|relrowsecurity|relforcerowsecurity'='Tables'
      'table_name|attname|attnotnull|type|default_hash'='Columns'
      'table_name|conname|contype|convalidated|condeferrable|condeferred|confdeltype|confupdtype|conkey|confkey|reference|definition_hash'='Constraints'
      'table_name|index_name|indisvalid|indisready|indisunique|definition_hash'='Indexes'
      'table_name|tgname|tgenabled|tgdeferrable|tginitdeferred|definition_hash|function_body_hash'='Triggers'
      'typname|enumlabel|enumsortorder'='Enums'
      'rolname|rolsuper|rolcreatedb|rolcreaterole|rolbypassrls'='Roles'
      'table_name|owner|migration_effective_owner|runtime_owner_or_member|runtime_select|runtime_insert|runtime_update|runtime_delete'='TablePermissions'
      'migration_schema_create|migration_schema_usage|migration_plpgsql_usage|runtime_schema_create'='SchemaPermissions'
      'extname|extversion'='Extensions'
      'jsonb_object_agg'='Counts'
      'option_values|absolute_price_values|modifier_only_values'='OptionValues'
      'products_with_options'='OptionProducts'
      'migration_name|checksum|finished|rolled_back'='HistoryEntries'
      'unfinished_migrations'='UnfinishedMigrations'
      'prisma_migration_history'='HistoryAbsent'
      'usename|backend_type|state|application_name_hash|sessions|oldest_transaction_age'='Activity'
      'sessions_visible'='SessionCount'
    }
}
$script:ExpectedTables=@('Account','Category','Order','OrderItem','OrderNotification','Product','ProductAttribute','ProductImage','ProductOption','ProductOptionValue','Review','Session','SiteContent','User')
function Get-CountValue([string]$Value) { if($Value -cnotmatch '^\d{1,12}$'){Stop-Preflight 'INVALID_NUMERIC_REPORT'}; return [long]$Value }
function Convert-SafeCell([string]$Field,[string]$Value,$Target) {
    if($Field -in @('database_name','connection_role','rolname')) {
        if($Value -cnotin @($Target.Database,$Target.AuditRole,$Target.ApplicationRole,$Target.MigrationRole)){Stop-Preflight 'IDENTITY_REPORT_MISMATCH'}; return $Value
    }
    if($Field -eq 'jsonb_object_agg') {
        $counts=$Value | ConvertFrom-Json; $names=@($counts.PSObject.Properties | ForEach-Object Name)
        if((($names | Sort-Object) -join '|') -cne (($script:ExpectedTables | Sort-Object) -join '|')){Stop-Preflight 'COUNT_KEYS_INVALID'}
        $safe=[ordered]@{}; foreach($name in $script:ExpectedTables){$safe[$name]=Get-CountValue ([string]$counts.$name)}; return $safe
    }
    if($Field -eq 'table_name' -and $Value -cin ($script:ExpectedTables+@('ProductVariant','ProductVariantSelection'))){return $Value}
    if($Field -match '^(schema_fingerprint|.*_hash)$'){if($Value -cnotmatch '^[a-f0-9]{32}$'){Stop-Preflight 'INVALID_HASH_REPORT'};return $Value}
    if($Field -eq 'checksum'){if($Value -cnotmatch '^[a-f0-9]{64}$'){Stop-Preflight 'INVALID_LEDGER_HASH'};return $Value}
    if($Field -in @('is_replica','read_only','relrowsecurity','relforcerowsecurity','attnotnull','convalidated','condeferrable','condeferred','indisvalid','indisready','indisunique','tgdeferrable','tginitdeferred','rolsuper','rolcreatedb','rolcreaterole','rolbypassrls','migration_effective_owner','runtime_owner_or_member','runtime_select','runtime_insert','runtime_update','runtime_delete','migration_schema_create','migration_schema_usage','migration_plpgsql_usage','runtime_schema_create','finished','rolled_back')) {
        if($Value -cin @('t','true','on')){return $true};if($Value -cin @('f','false','off')){return $false};Stop-Preflight 'INVALID_BOOLEAN_REPORT'
    }
    if($Field -in @('option_values','absolute_price_values','modifier_only_values','products_with_options','unfinished_migrations','sessions','sessions_visible')){return Get-CountValue $Value}
    if($Field -eq 'server_version'){if($Value -cnotmatch '^(\d{1,2}(?:\.\d{1,2})?)(?:\s|$)'){Stop-Preflight 'VERSION_REPORT_INVALID'};return $Matches[1]}
    if($Field -eq 'state'){if($Value -ceq ''){return $null};if($Value -cin @('active','idle','idle in transaction','idle in transaction (aborted)','fastpath function call','disabled')){return $Value}}
    if($Field -eq 'oldest_transaction_age'){if(-not $Value){return $null};if($Value -cmatch '^(?:\d+ days? )?\d+:\d{2}:\d{2}(?:\.\d+)?$'){return $Value};Stop-Preflight 'INTERVAL_REPORT_INVALID'}
    if($Field -eq 'prisma_migration_history'){if($Value -cne 'ABSENT: repository currently uses reviewed manual SQL'){Stop-Preflight 'HISTORY_REPORT_INVALID'};return 'ABSENT'}
    # Metadata names/types/labels are deliberately hashed. No dynamic database text
    # (migration names, extensions, column names, writer names) enters the report.
    return ('sha256:'+(Get-TextHash $Value))
}
function Convert-PreflightCsv([string]$Raw,$Target) {
    if($Raw.Length -gt 8388608){Stop-Preflight 'REPORT_LIMIT_EXCEEDED'}
    Add-Type -AssemblyName Microsoft.VisualBasic
    $reader=[IO.StringReader]::new($Raw); $parser=[Microsoft.VisualBasic.FileIO.TextFieldParser]::new($reader)
    $parser.TextFieldType=[Microsoft.VisualBasic.FileIO.FieldType]::Delimited; $parser.SetDelimiters(','); $parser.HasFieldsEnclosedInQuotes=$true; $parser.TrimWhiteSpace=$false
    $sections=Get-PreflightSections; $result=[ordered]@{}; $section=''; $headers=@()
    try {
        while(-not $parser.EndOfData){
            $row=$parser.ReadFields(); $signature=$row -join '|'
            if($sections.ContainsKey($signature)) {
                $section=$sections[$signature]; if($result.Contains($section)){Stop-Preflight 'DUPLICATE_REPORT_SECTION'}
                $headers=$row; $result[$section]=[Collections.Generic.List[object]]::new();continue
            }
            if(-not $section -or $row.Count -ne $headers.Count -or $result[$section].Count -ge 5000){Stop-Preflight 'CSV_REPORT_INVALID'}
            $safe=[ordered]@{};for($i=0;$i -lt $headers.Count;$i++){$safe[$headers[$i]]=Convert-SafeCell $headers[$i] $row[$i] $Target};$result[$section].Add($safe)
        }
    } finally { $parser.Dispose();$reader.Dispose() }
    foreach($required in @('Identity','Fingerprint','Tables','Columns','Constraints','Indexes','Triggers','Enums','Roles','TablePermissions','SchemaPermissions','Extensions','Counts','OptionValues','OptionProducts','Activity','SessionCount')){if(-not $result.Contains($required)){Stop-Preflight 'REPORT_SECTION_MISSING'}}
    foreach($single in @('Identity','Fingerprint','SchemaPermissions','Counts','OptionValues','OptionProducts','SessionCount')){if($result[$single].Count -ne 1){Stop-Preflight 'REPORT_CARDINALITY_INVALID'}}
    if(-not $result.Identity[0].read_only -or $result.Identity[0].is_replica -or $result.Identity[0].database_name -cne $Target.Database -or $result.Identity[0].connection_role -cne $Target.AuditRole){Stop-Preflight 'SERVER_IDENTITY_MISMATCH'}
    if($result.Contains('HistoryAbsent')){if($result.HistoryAbsent.Count -ne 1 -or $result.Contains('HistoryEntries')){Stop-Preflight 'HISTORY_SECTION_INVALID'}}
    elseif(-not $result.Contains('HistoryEntries') -or -not $result.Contains('UnfinishedMigrations') -or $result.UnfinishedMigrations.Count -ne 1){Stop-Preflight 'HISTORY_SECTION_MISSING'}
    return $result
}
function Get-PreflightFindings($Evidence,$Target) {
    $findings=[Collections.Generic.List[string]]::new()
    if($Evidence.Fingerprint[0].schema_fingerprint -cne $Target.BaselineFingerprint){$findings.Add('SCHEMA_FINGERPRINT_DIFFERS')}
    if($Evidence.Tables.Count -ne 14 -or $Evidence.Indexes.Count -ne 31 -or @($Evidence.Constraints | Where-Object {$_.contype -eq ('sha256:'+(Get-TextHash 'f'))}).Count -ne 11){$findings.Add('BASELINE_OBJECT_SET_DIFFERS')}
    if($Evidence.Identity[0].server_version -notmatch '^18(?:\.|$)'){$findings.Add('SERVER_MAJOR_REVIEW_REQUIRED')}
    if($Evidence.Contains('HistoryEntries')){$findings.Add('PRISMA_HISTORY_RECONCILIATION_REQUIRED')}
    if(@($Evidence.TablePermissions | Where-Object {-not $_.migration_effective_owner}).Count -or -not $Evidence.SchemaPermissions[0].migration_schema_create -or -not $Evidence.SchemaPermissions[0].migration_schema_usage -or -not $Evidence.SchemaPermissions[0].migration_plpgsql_usage){$findings.Add('MIGRATION_PRIVILEGES_REQUIRE_REVIEW')}
    if($Evidence.TablePermissions.Count -lt 14 -or @($Evidence.TablePermissions | Where-Object {-not $_.runtime_select -or -not $_.runtime_insert -or -not $_.runtime_update -or -not $_.runtime_delete}).Count){$findings.Add('RUNTIME_TABLE_PERMISSIONS_REQUIRE_REVIEW')}
    if(@($Evidence.Indexes | Where-Object {-not $_.indisvalid -or -not $_.indisready}).Count -or @($Evidence.Constraints | Where-Object {-not $_.convalidated}).Count){$findings.Add('INVALID_OR_UNVALIDATED_SCHEMA_OBJECTS')}
    if(@($Evidence.Activity | Where-Object {$_.state -in @('active','idle in transaction','idle in transaction (aborted)')}).Count){$findings.Add('ACTIVE_OR_TRANSACTIONAL_WRITERS_OBSERVED')}
    $findings.Add('WRITER_VISIBILITY_AND_EXTERNAL_CONSUMERS_REQUIRE_OPERATOR_REVIEW')
    $findings.Add('NEW_TABLE_RUNTIME_GRANTS_REQUIRE_POSTMIGRATION_REVIEW')
    $findings.Add('FRESH_VERIFIED_BACKUP_AND_EXPLICIT_OWNER_APPROVAL_REQUIRED')
    return @($findings)
}
function Get-PreflightGuard($Target) {
    Assert-Target $Target
    return @'
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
DO $b18preflight$ BEGIN
 IF current_database()<>'__DATABASE__' OR current_user::text<>'__ROLE__' OR pg_is_in_recovery()
 OR current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION USING ERRCODE='B18P1',MESSAGE='B18_PREFLIGHT_IDENTITY_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_foreign_table) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relrowsecurity OR c.relforcerowsecurity))
 THEN RAISE EXCEPTION USING ERRCODE='B18P2',MESSAGE='B18_PREFLIGHT_EXTERNAL_OR_RLS_REVIEW_REQUIRED'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND c.relname IN ('Account','Category','Order','OrderItem','OrderNotification','Product','ProductAttribute','ProductImage','ProductOption','ProductOptionValue','Review','Session','SiteContent','User'))<>14
 THEN RAISE EXCEPTION USING ERRCODE='B18P3',MESSAGE='B18_PREFLIGHT_BASE_TABLE_REVIEW_REQUIRED'; END IF;
END $b18preflight$;
COMMIT;
'@.Replace('__DATABASE__',$Target.Database).Replace('__ROLE__',$Target.AuditRole)
}
function Get-PreflightClientError([string]$Diagnostic) {
    if($Diagnostic -match '\b(?:ERROR|FATAL):\s+([A-Z0-9]{5})\b'){
        switch($Matches[1]){
            'B18P1'{return 'TARGET_IDENTITY_OR_PRIMARY_MISMATCH'}
            'B18P2'{return 'EXTERNAL_OR_RLS_REVIEW_REQUIRED'}
            'B18P3'{return 'EXPECTED_BASE_TABLES_MISSING_OR_VIEWS'}
            default{return ('SQL_'+$Matches[1])}
        }
    }
    if($Diagnostic -match 'server certificate.*does not match host name|hostname mismatch'){return 'TLS_HOSTNAME_MISMATCH'}
    if($Diagnostic -match 'could not (?:load|read) (?:SSL )?root certificate|root certificate file.*does not exist|could not load system root certificates'){return 'TLS_ROOT_CONFIGURATION_FAILED'}
    if($Diagnostic -match 'could not (?:load|read) (?:SSL )?(?:client certificate|private key)|private key file'){return 'TLS_CLIENT_CERTIFICATE_CONFIGURATION_FAILED'}
    if($Diagnostic -match 'certificate has expired'){return 'TLS_CERTIFICATE_EXPIRED'}
    if($Diagnostic -match 'certificate is not yet valid'){return 'TLS_CERTIFICATE_NOT_YET_VALID'}
    if($Diagnostic -match 'certificate revoked'){return 'TLS_CERTIFICATE_REVOKED'}
    if($Diagnostic -match 'unable to get (?:local )?issuer certificate|unable to verify the first certificate|self[- ]signed certificate'){return 'TLS_ISSUER_NOT_TRUSTED'}
    if($Diagnostic -match 'certificate verify failed'){return 'TLS_CHAIN_VERIFICATION_FAILED'}
    if($Diagnostic -match 'certificate|SSL error|TLS') {return 'TLS_VERIFICATION_FAILED'}
    if($Diagnostic -match 'password authentication failed|no password supplied') {return 'SQL_28P01'}
    if($Diagnostic -match 'could not translate host|could not connect|connection refused|timed out') {return 'CONNECTION_UNAVAILABLE'}
    return 'SQL_CLIENT'
}

# The main is never loaded/executed by offline tests.
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runId=[guid]::NewGuid().ToString('N'); $root=Join-Path $env:LOCALAPPDATA '3dkid-batch18-production-preflight'
$directory=Join-Path $root $runId; $reportPath=Join-Path $directory 'result.json'; $sqlPath=Join-Path $directory 'readonly.sql'
$rootCertificatePath=Join-Path $directory 'trusted-roots.pem'
$password=$null; $info=$null; $process=$null; $started=$false; $privateReady=$false; $exitCode=1
$report=[ordered]@{RunId=$runId;StartedUtc=[DateTime]::UtcNow.ToString('o');Status='BLOCKED';ErrorCode='';Target=$null;Evidence=$null;Findings=@();MigrationApproved=$false;CompletedUtc=''}
try {
    $values=[ordered]@{SharedDatabase=[bool]$SharedDatabase;ProjectName=$ProjectName;BranchName=$BranchName;ProjectId=$ProjectId;BranchId=$BranchId;DirectHost=$DirectHost;Database=$Database;AuditRole=$AuditRole;MigrationRole=$MigrationRole;ApplicationRole=$ApplicationRole;VercelHost=$VercelHost;VercelDatabase=$VercelDatabase;VercelRole=$VercelRole;VercelSchema=$VercelSchema;DeployedCommit=$DeployedCommit;BaselineFingerprint=$BaselineFingerprint}
    if($SharedDatabase){Set-ConfirmedSharedDefaults $values}
    foreach($key in @($values.Keys)){
        if($key -eq 'SharedDatabase' -or ($SharedDatabase -and $key -in @('ProjectId','BranchId')) -or (-not $SharedDatabase -and $key -in @('ProjectName','BranchName'))){continue}
        if(-not $values[$key]){$values[$key]=Read-Host ($key+' (NONSECRET metadata only; no URLs/passwords)')}
    }
    $target=[pscustomobject]$values; Assert-Target $target
    $source=Join-Path $repository 'docs/release/batch-1.8-production-preflight.sql'
    $verifiedSql=Read-VerifiedPreflightSql $source
    if((Read-Host 'Confirm this tuple came from the ACTIVE Production deployment and Neon primary: type READONLY') -cne 'READONLY'){Stop-Preflight 'OPERATOR_ATTESTATION_REQUIRED'}
    New-PrivatePreflightDirectory $directory; $privateReady=$true
    $report.Target=$target; $report['InfrastructureMapping']='OPERATOR_ATTESTED; SQL verifies database/role, not Neon project ownership'
    $report['ReadOnlySqlSha256']='64139191343df170888a22af34f298cebd5fe61d8064d9b313ab7362791e0284'
    $roots=Get-PreflightWindowsRoots
    [IO.File]::WriteAllText($rootCertificatePath,$roots.Pem,[Text.UTF8Encoding]::new($false))
    $report['Tls']=[ordered]@{Mode='verify-full';TrustSource='WINDOWS_CURRENTUSER_AND_LOCALMACHINE_ROOT';CertificateCount=$roots.CertificateCount;BundleSha256=$roots.Sha256}
    $roots=$null
    $sql=(Get-PreflightGuard $target)+"`n"+$verifiedSql
    [IO.File]::WriteAllText($sqlPath,$sql,[Text.UTF8Encoding]::new($false))
    $password=Read-Host 'Enter NEON AUDIT-role password (secure local prompt; never send it to chat)' -AsSecureString
    if($password.Length -eq 0){Stop-Preflight 'PASSWORD_REQUIRED'}
    $info=New-PreflightClient $target $sqlPath $password $rootCertificatePath
    $process=[Diagnostics.Process]::new();$process.StartInfo=$info;$started=$process.Start()
    $outTask=$process.StandardOutput.ReadToEndAsync();$errTask=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(180000)){$process.Kill();Stop-Preflight 'READONLY_CLIENT_TIMEOUT'}
    $stdout=$outTask.GetAwaiter().GetResult();$stderr=$errTask.GetAwaiter().GetResult()
    if($process.ExitCode -ne 0){Stop-Preflight (Get-PreflightClientError $stderr)}
    $report.Evidence=Convert-PreflightCsv $stdout $target
    $report.Findings=Get-PreflightFindings $report.Evidence $target
    $stdout=$null;$stderr=$null;$report.Status='COLLECTED';$exitCode=0
} catch {
    $code=$_.Exception.Message;if($code -cnotmatch '^B18_PREFLIGHT_[A-Z0-9_]+$'){$code='B18_PREFLIGHT_CHECK_FAILED'}
    $report.ErrorCode=$code;Write-Host ('BLOCKED: '+$code+' (raw diagnostics suppressed)')
} finally {
    $stdout=$null;$stderr=$null
    if($info){Clear-PreflightClient $info}
    if($process){if($started -and -not $process.HasExited){$process.Kill()};$process.Dispose()}
    if($password){$password.Dispose();$password=$null}
    $report.CompletedUtc=[DateTime]::UtcNow.ToString('o')
    try {
        if($privateReady -and (Test-Path -LiteralPath $directory)){
            $actual=[IO.Path]::GetFullPath($directory).TrimEnd('\')
            if([IO.Path]::GetDirectoryName($actual) -ine [IO.Path]::GetFullPath($root).TrimEnd('\') -or [IO.Path]::GetFileName($actual) -cne $runId){Stop-Preflight 'OUTPUT_OWNERSHIP_FAILED'}
            if(Test-Path -LiteralPath $sqlPath){Remove-Item -LiteralPath $sqlPath -Force}
            if(Test-Path -LiteralPath $rootCertificatePath){Remove-Item -LiteralPath $rootCertificatePath -Force}
            [IO.File]::WriteAllText($reportPath,($report | ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
            Write-Host ('Sanitized report: '+$reportPath)
        }
    } catch {Write-Host 'BLOCKED: sanitized result write/cleanup failed.';$exitCode=1}
    Write-Host ('Read-only collection: '+$report.Status+'; exit code: '+$exitCode)
    Write-Host 'COLLECTED means evidence collected, never migration approval. No backup, DDL, DML or release action.'
}
exit $exitCode
