# Operator-only local rehearsal. Never dot-source or run this through a transcript.
# No host/URL parameters; no credential files; no automatic database cleanup.
# Requires Windows PowerShell 5.1+, local PG18.7 tools and the LOCAL postgres password.
[CmdletBinding()]
param([switch]$FreshProductionRestore)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'

function Stop-Safe([string]$Code) { throw [InvalidOperationException]::new("B18_OP_$Code") }
function Get-RehearsalSource([bool]$Fresh) {
    if($Fresh){return 'batch18_backup_verify_bded0676ab034ceeb0fc874a2b409005'}
    return 'restore_3dkid_batch18'
}
function Get-CloneStatement([string]$Name) {
    if($Name -cnotmatch '^batch18_rehearsal_[a-f0-9]{32}$' -or
       $script:Baseline -cnotin @((Get-RehearsalSource $false),(Get-RehearsalSource $true))){Stop-Safe 'CLONE_SOURCE_REFUSED'}
    return "CREATE DATABASE `"$Name`" WITH TEMPLATE `"$script:Baseline`";"
}
function Read-FreshReferenceEvidence {
    $path=Join-Path $env:LOCALAPPDATA '3dkid-batch18-production-backups\20261122T205812Z_068e157132624ffea23199cea986dc0c\restore_bded0676ab034ceeb0fc874a2b409005\restore-result.json'
    $bytes=[IO.File]::ReadAllBytes($path);$sha=[Security.Cryptography.SHA256]::Create()
    try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    if($hash -cne '09e255d31eec1f4060109d0a9059162cdf4062d295f6ccfbd293f52ade91a3cb'){Stop-Safe 'FRESH_REFERENCE_REPORT_REVIEW_REQUIRED'}
    $reference=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json
    if($reference.Status -cne 'RESTORE_VERIFIED' -or -not $reference.RestoreVerified -or
       $reference.Database -cne (Get-RehearsalSource $true) -or
       $reference.SourceArchiveSha256 -cne 'ce4aca760e8c4a0ea479341b68ff793e3b472a99b175b2cdc3673cc22566984b' -or
       $reference.Evidence.SchemaFingerprint -cne 'c7068acb15096ec556a1d5e1e80ec559'){Stop-Safe 'FRESH_REFERENCE_IDENTITY_DIFFERS'}
    return $reference
}
function ConvertTo-NativeArguments([string[]]$Items) {
    $quoted = foreach ($item in $Items) {
        if ($null -eq $item -or $item -match '["\r\n\x00]' -or $item.EndsWith('\')) { Stop-Safe 'INVALID_CLIENT_ARGUMENT' }
        '"' + $item + '"'
    }
    return ($quoted -join ' ')
}
function ConvertTo-LocalPath([string]$Value) {
    return [IO.Path]::GetFullPath($Value.Replace('/', '\')).TrimEnd('\').ToLowerInvariant()
}
function Assert-Clone([string]$Database) {
    if ($Database -notmatch '^batch18_rehearsal_[a-f0-9]{32}$' -or
        -not $script:OwnedDatabases.Contains($Database) -or $Database -eq $script:Baseline) {
        Stop-Safe 'UNOWNED_WRITE_TARGET'
    }
}
function New-PrivateDirectory([string]$Path) {
    if (Test-Path -LiteralPath $Path) { Stop-Safe 'TEMP_PATH_ALREADY_EXISTS' }
    [void][IO.Directory]::CreateDirectory($Path)
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagate = [Security.AccessControl.PropagationFlags]::None
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', $inherit, $propagate, 'Allow')
    $acl.AddAccessRule($rule)
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($system, 'FullControl', $inherit, $propagate, 'Allow'))
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-OwnedTempDirectory([string]$Path, [string]$Root, [string]$Id) {
    $absolute = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($Id -notmatch '^[a-f0-9]{32}$' -or
        [IO.Path]::GetDirectoryName($absolute) -ine [IO.Path]::GetFullPath($Root).TrimEnd('\') -or
        [IO.Path]::GetFileName($absolute) -cne $Id) { Stop-Safe 'TEMP_CLEANUP_PATH_REFUSED' }
    if ([IO.File]::ReadAllText((Join-Path $absolute '.owner')) -cne $Id) { Stop-Safe 'TEMP_CLEANUP_OWNER_REFUSED' }
}
function New-PgProcessInfo([string]$Database, [string]$SqlFile, [bool]$ReadOnly) {
    if ($Database -ne $script:Baseline -and $Database -ne 'postgres') { Assert-Clone $Database }
    if (-not $ReadOnly -and $Database -eq $script:Baseline) { Stop-Safe 'BASELINE_WRITE_REFUSED' }
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $script:Psql
    $info.Arguments = ConvertTo-NativeArguments @('-X','-q','-w','-h','127.0.0.1','-p','55432','-U','postgres',
        '-d',$Database,'-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f',$SqlFile)
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    # Child-only environment: do not inspect/read existing credential files or
    # mutate/save/restore the caller's environment (which could contain secrets).
    foreach ($key in @($info.EnvironmentVariables.Keys)) {
        if ($key -like 'PG*' -or $key -in @('DATABASE_URL','DIRECT_URL')) { $info.EnvironmentVariables.Remove($key) }
    }
    $info.EnvironmentVariables['PGHOSTADDR'] = '127.0.0.1'
    $info.EnvironmentVariables['PGSSLMODE'] = 'disable'
    $info.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '5'
    $info.EnvironmentVariables['PGCLIENTENCODING'] = 'UTF8'
    $info.EnvironmentVariables['PGAPPNAME'] = 'batch18_operator_rehearsal'
    # This path deliberately does not exist. PGPASSWORD is used, never pgpass files.
    $info.EnvironmentVariables['PGPASSFILE'] = Join-Path $script:TempDirectory 'DO-NOT-CREATE.pgpass'
    $mode = if ($ReadOnly) { 'on' } else { 'off' }
    $info.EnvironmentVariables['PGOPTIONS'] = "-c default_transaction_read_only=$mode -c search_path=pg_catalog -c client_min_messages=error -c log_min_messages=panic -c log_min_error_statement=panic -c log_error_verbosity=terse -c log_parameter_max_length=0 -c log_parameter_max_length_on_error=0"
    $pointer = [IntPtr]::Zero; $plain = $null
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($script:LocalPassword)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $info.EnvironmentVariables['PGPASSWORD'] = $plain
    } catch {
        Clear-PgProcessInfo $info
        throw
    } finally {
        $plain = $null
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
    return $info
}
function Clear-PgProcessInfo([Diagnostics.ProcessStartInfo]$Info) {
    foreach ($key in @($Info.EnvironmentVariables.Keys)) { if ($key -like 'PG*') { $Info.EnvironmentVariables.Remove($key) } }
}
function Get-IdentityGuard([string]$Database) {
    $dbLiteral = $Database.Replace("'", "''")
    $startCheck = if ($script:ServerStart) {
        "OR pg_postmaster_start_time() IS DISTINCT FROM '$($script:ServerStart)'::timestamptz"
    } else { '' }
    return @"
DO `$guard`$ BEGIN
  IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432
     OR current_database()<>'$dbLiteral' OR current_user::text<>'postgres'
     OR current_setting('server_version_num')::int<>180007 OR pg_is_in_recovery()
     OR lower(rtrim(replace(current_setting('data_directory'),chr(92),'/'),'/'))<>'c:/users/alexa/appdata/local/3dkid-pg18-restore'
     $startCheck
  THEN RAISE EXCEPTION USING ERRCODE='B1802', MESSAGE='B18_WRONG_LOCAL_SERVER'; END IF;
END `$guard`$;
"@
}
function Get-SafeSqlLocation([string]$Diagnostic, [string]$GeneratedFile, [int]$PrefixLines, [int]$SubmittedLines, [object[]]$SourceMap) {
    $unknown = [pscustomobject]@{ Statement=''; Source=''; SourceLine=0 }
    if (-not $GeneratedFile -or $SubmittedLines -le 0) { return $unknown }
    $header = [regex]::Match($Diagnostic, '(?m)^psql:(?<file>[^\r\n]+):(?<line>[1-9][0-9]{0,6}):\s+(?:ERROR|FATAL):')
    if (-not $header.Success -or
        $header.Groups['file'].Value.Replace('\','/') -ine $GeneratedFile.Replace('\','/')) { return $unknown }
    $line = [int]$header.Groups['line'].Value
    if ($line -gt $PrefixLines + $SubmittedLines) { return $unknown }
    if ($line -le $PrefixLines) { return [pscustomobject]@{Statement='IDENTITY_GUARD';Source='runner:Get-IdentityGuard';SourceLine=$line} }
    $line -= $PrefixLines
    foreach ($map in $SourceMap) {
        if ($line -ge $map.StartLine -and $line -le $map.EndLine -and
            $map.Source -cin @('docs/review/batch-1.8-production-candidate.sql','runner:Invoke-Candidate/settings') -and
            $map.Statement -cin @('CLIENT_SETTINGS','CANDIDATE_PREFLIGHT','VARIANT_DDL','CANDIDATE_POSTCHECK','CATEGORY_DELETE_POSTCHECK','CANDIDATE_FINALIZE')) {
            return [pscustomobject]@{Statement=$map.Statement;Source=$map.Source;SourceLine=($line-$map.StartLine+$map.SourceStartLine)}
        }
    }
    return [pscustomobject]@{Statement='RUNNER_SQL';Source='runner:submitted-sql';SourceLine=$line}
}
function New-CandidateSourceMap([string]$Sql, [int]$SettingsLines) {
    $rows = @($Sql -split '\r?\n')
    [pscustomobject]@{StartLine=1;EndLine=$SettingsLines;Source='runner:Invoke-Candidate/settings';SourceStartLine=1;Statement='CLIENT_SETTINGS'}
    $start = 1; $statement = 'CANDIDATE_PREFLIGHT'
    for ($i=0; $i -lt $rows.Count; $i++) {
        $next = $statement
        if ($rows[$i] -ceq '-- B18_PRESERVED_REVIEW_BODY_BEGIN') { $next='VARIANT_DDL' }
        elseif ($rows[$i] -ceq '-- B18_PRESERVED_REVIEW_BODY_END') { $next='CANDIDATE_POSTCHECK' }
        elseif ($rows[$i] -match '^DO \$(?:\$)? BEGIN$' -and
            (($rows[$i..([Math]::Min($i+5,$rows.Count-1))] -join "`n") -cmatch 'B18_CATEGORY_DELETION_NOT_PROTECTED')) { $next='CATEGORY_DELETE_POSTCHECK' }
        elseif ($rows[$i] -ceq 'SET CONSTRAINTS ALL IMMEDIATE;') { $next='CANDIDATE_FINALIZE' }
        if ($next -cne $statement) {
            [pscustomobject]@{StartLine=$SettingsLines+$start;EndLine=$SettingsLines+$i;Source='docs/review/batch-1.8-production-candidate.sql';SourceStartLine=$start;Statement=$statement}
            $start=$i+1; $statement=$next
        }
    }
    [pscustomobject]@{StartLine=$SettingsLines+$start;EndLine=$SettingsLines+$rows.Count;Source='docs/review/batch-1.8-production-candidate.sql';SourceStartLine=$start;Statement=$statement}
}
function Get-SafePgFailure([string]$Diagnostic, [string]$Progress = '', [string]$GeneratedFile = '', [int]$PrefixLines = 0, [int]$SubmittedLines = 0, [object[]]$SourceMap = @()) {
    $state = ''; $identifier = 'UNCLASSIFIED'
    if ($Diagnostic -match '(?im)\b(?:ERROR|FATAL):\s+([A-Z0-9]{5})\b') { $state = $Matches[1] }
    elseif ($Diagnostic -match 'password authentication failed|no password supplied') { $state = 'AUTH' }
    # Whitelist only schema/guard names known from reviewed source. Never copy
    # DETAIL, CONTEXT, SQL, customer rows or arbitrary messages into a report.
    $constraints = @('Order_checkout_acceptance_check','Order_checkout_locale_check',
        'OrderItem_productId_fkey','OrderItem_productId_productVariantId_fkey',
        'ProductVariant_price_bounds','ProductVariant_id_format','Product_variantRevision_nonnegative')
    $guards = @('B18_IMMUTABLE_PRODUCT_ID','B18_NO_LEGACY_DOWNGRADE','B18_REVISION_DB_MANAGED',
        'B18_REVISION_EXHAUSTED','B18_IMMUTABLE_SELECTION','B18_IMMUTABLE_ID','B18_IMMUTABLE_VALUE_OWNER',
        'B18_IMMUTABLE_PRODUCT_OWNER','B18_IMMUTABLE_KIND','B18_IMMUTABLE_TUPLE','B18_MISSING_PARENT',
        'B18_RETIRE_INSTEAD_OF_DELETE','B18_INVALID_VALUE_ID','B18_LEGACY_TYPED_GROUP','B18_INVALID_TYPED_VALUE',
        'B18_INVALID_COMBINATION','B18_MODE_OR_RETIREMENT_MISMATCH','B18_IMMUTABLE_ORDER_SNAPSHOT',
        'B18_ORDER_PRODUCT_MISSING','B18_UNEXPECTED_VARIANT','B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE',
        'B18_INVALID_ORDER_SNAPSHOT','B18_SNAPSHOT_SELECTION_MISMATCH')
    foreach ($name in $constraints) {
        if ($Diagnostic -cmatch ('(?m)^\s*CONSTRAINT NAME:\s*' + [regex]::Escape($name) + '\s*$')) {
            $identifier = $name; break
        }
    }
    if ($identifier -ceq 'UNCLASSIFIED') {
        foreach ($name in $guards) {
            if ($Diagnostic -cmatch ('(?m)^(?:psql:[^\r\n]*?:\s*)?(?:ERROR|FATAL):\s+[A-Z0-9]{5}:\s*' + [regex]::Escape($name) + '\s*$')) {
                $identifier = $name; break
            }
        }
    }
    # These SQL-emitted progress markers contain no rows. They identify attempts,
    # not successful checks, and never accept arbitrary stdout as report content.
    $nativeSubstep = ''
    $nativeSteps = @('NativeFixtures','FlushFixtureConstraints','VariantAndOrderAssertions',
        'HistoricalOrderDeleteProtection','UnreferencedProductCascade','NativeTransactionRollback')
    $markers = [regex]::Matches($Progress, '(?m)^B18_NATIVE_SUBSTEP=([A-Za-z]+)\r?$')
    if ($markers.Count -gt 0 -and $nativeSteps -ccontains $markers[$markers.Count-1].Groups[1].Value) {
        $nativeSubstep = $markers[$markers.Count-1].Groups[1].Value
    }
    $location = Get-SafeSqlLocation $Diagnostic $GeneratedFile $PrefixLines $SubmittedLines $SourceMap
    if ($identifier -ceq 'UNCLASSIFIED' -and $location.Statement) { $identifier=$location.Statement }
    return [pscustomobject]@{ SqlState=$state; Identifier=$identifier; NativeSubstep=$nativeSubstep; Statement=$location.Statement; Source=$location.Source; SourceLine=$location.SourceLine }
}
function Invoke-PgSql([string]$Database, [string]$Sql, [bool]$ReadOnly = $true, [object[]]$SourceMap = @()) {
    if (-not $ReadOnly) {
        if ($Database -eq 'postgres') {
            $match=[regex]::Match($Sql,'^CREATE DATABASE "(batch18_rehearsal_[a-f0-9]{32})" WITH TEMPLATE "[a-z0-9_]+";$')
            if (-not $match.Success -or $Sql -cne (Get-CloneStatement $match.Groups[1].Value)) { Stop-Safe 'MAINTENANCE_WRITE_REFUSED' }
        } else { Assert-Clone $Database }
    }
    $file = Join-Path $script:TempDirectory (([guid]::NewGuid().ToString('N')) + '.sql')
    $prefix = (Get-IdentityGuard $Database) + "`n"
    [IO.File]::WriteAllText($file, ($prefix + $Sql), [Text.UTF8Encoding]::new($false))
    $info = $null; $process = $null; $started = $false
    try {
        $info = New-PgProcessInfo $Database $file $ReadOnly
        $process = [Diagnostics.Process]::new(); $process.StartInfo = $info
        $started = $process.Start()
        # Drain both pipes concurrently. Never emit or persist raw diagnostics.
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(120000)) { $process.Kill(); Stop-Safe 'LOCAL_CLIENT_TIMEOUT' }
        $stdout = $outTask.GetAwaiter().GetResult(); $stderr = $errTask.GetAwaiter().GetResult()
        $failure = Get-SafePgFailure $stderr $stdout $file ([regex]::Matches($prefix,"`n").Count) (@($Sql -split '\r?\n').Count) $SourceMap
        $result = [pscustomobject]@{ ExitCode = $process.ExitCode; SqlState = $failure.SqlState; Identifier=$failure.Identifier; NativeSubstep=$failure.NativeSubstep; Statement=$failure.Statement; Source=$failure.Source; SourceLine=$failure.SourceLine; Output = '' }
        if ($process.ExitCode -eq 0) { $result.Output = $stdout.Trim() }
        $stdout = $null; $stderr = $null
        return $result
    } finally {
        if ($info) { Clear-PgProcessInfo $info }
        if ($process) {
            if ($started -and -not $process.HasExited) { $process.Kill() }
            $process.Dispose()
        }
    }
}
function Require-Success($Result) {
    if ($Result.ExitCode -ne 0) {
        $safeState = if ($Result.SqlState -match '^[A-Z0-9]{4,5}$') { $Result.SqlState } else { 'CLIENT' }
        if ($null -eq $script:Report.SqlFailure) {
            $script:Report.SqlFailure = [ordered]@{ SqlState=$safeState; Identifier=$Result.Identifier; Statement=''; Source=''; SourceLine=0 }
            if ($Result.PSObject.Properties['Source']) {
                $script:Report.SqlFailure.Statement=$Result.Statement
                $script:Report.SqlFailure.Source=$Result.Source
                $script:Report.SqlFailure.SourceLine=$Result.SourceLine
            }
        }
        if ($Result.PSObject.Properties['NativeSubstep'] -and $Result.NativeSubstep) {
            $script:Report.FailureSubstep = $Result.NativeSubstep
        }
        Stop-Safe ("SQL_" + $safeState)
    }
    return $Result.Output
}
function Invoke-CloneSql([string]$Database, [string]$Sql, [object[]]$SourceMap = @()) {
    Assert-Clone $Database
    return Invoke-PgSql $Database $Sql $false $SourceMap
}
function Get-Snapshot([string]$Database) {
    $countRows = foreach ($table in $script:BaselineTables) { "SELECT '$table' AS name,count(*)::bigint AS n FROM public.`"$table`"" }
    $recordRows=foreach($table in $script:BaselineTables){
        $record=switch($table){
            'Product'{"to_jsonb(t)-'optionMode'-'variantRevision'-'materials'-'materialsEn'-'materialsDivider'"}
            'ProductOption'{"to_jsonb(t)-'kind'"}
            'ProductOptionValue'{"to_jsonb(t)-'retiredAt'"}
            'OrderItem'{"to_jsonb(t)-'productVariantId'"}
            default{'to_jsonb(t)'}
        }
        "SELECT '$table' AS name,md5(coalesce(jsonb_agg($record ORDER BY id COLLATE `"C`")::text,'[]')) AS digest FROM public.`"$table`" t"
    }
    # A single JSON result. Reuse the exact reviewed fingerprint expression as a scalar CTE.
    $fingerprint = $script:FingerprintSql.Trim().TrimEnd(';')
    $sql = @"
BEGIN READ ONLY;
SET LOCAL timezone='UTC';
SET LOCAL datestyle='ISO,YMD';
SET LOCAL extra_float_digits=3;
WITH fingerprint AS ($fingerprint), counts AS ($($countRows -join ' UNION ALL ')), records AS ($($recordRows -join ' UNION ALL '))
SELECT jsonb_build_object(
 'schema',(SELECT schema_fingerprint FROM fingerprint),
 'counts',(SELECT jsonb_object_agg(name,n ORDER BY name) FROM counts),
 'records',(SELECT jsonb_object_agg(name,digest ORDER BY name) FROM records),
 'products',(SELECT coalesce(jsonb_object_agg(id,md5((to_jsonb(p)-'optionMode'-'variantRevision'-'materials'-'materialsEn'-'materialsDivider')::text) ORDER BY id),'{}'::jsonb) FROM public."Product" p),
 'categories',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'[]')) FROM public."Category" c),
 'images',(SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY id)::text,'[]')) FROM public."ProductImage" i),
 'attributes',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'[]')) FROM public."ProductAttribute" a),
 'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
 'indexes',(SELECT count(*) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'foreignKeys',(SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f'));
COMMIT;
"@
    return ((Require-Success (Invoke-PgSql $Database $sql $true)) | ConvertFrom-Json)
}
function Assert-Equal($Left, $Right, [string]$Code) {
    if (($Left | ConvertTo-Json -Compress -Depth 40) -cne ($Right | ConvertTo-Json -Compress -Depth 40)) { Stop-Safe $Code }
}
function Assert-DataPreserved($Before, $After) {
    foreach ($key in @('counts','products','categories','images','attributes','records')) { Assert-Equal $Before.$key $After.$key ('PRESERVATION_' + $key.ToUpperInvariant()) }
}
function New-RehearsalClone {
    $name = 'batch18_rehearsal_' + [guid]::NewGuid().ToString('N')
    $script:Report.Databases += $name # Preserve even an uncertain CREATE result for inspection.
    [void](Require-Success (Invoke-PgSql 'postgres' (Get-CloneStatement $name) $false))
    [void]$script:OwnedDatabases.Add($name)
    return $name
}
function Invoke-Candidate([string]$Database, [string]$Fingerprint, [string]$Sql) {
    Assert-Clone $Database
    if ($Fingerprint -notmatch '^[a-f0-9]{32}$') { Stop-Safe 'INVALID_BASELINE_FINGERPRINT' }
    $settings = @"
DO `$settings`$ BEGIN
 PERFORM set_config('batch18.execution_mode','LOCAL_REHEARSAL',false);
 PERFORM set_config('batch18.expected_database','$Database',false);
 PERFORM set_config('batch18.expected_role','postgres',false);
 PERFORM set_config('batch18.expected_schema_fingerprint','$Fingerprint',false);
END `$settings`$;
"@
    $map = @(New-CandidateSourceMap $Sql (@($settings -split '\r?\n').Count))
    return Invoke-CloneSql $Database ($settings + "`n" + $Sql) $map
}
function Complete-Check([string]$Name) {
    $script:Report.Checks[$Name] = 'PASS'
    Write-Host ("PASS: " + $Name)
}

$script:SchemaSql = @'
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'name',column_name,'type',udt_name,
   'nullable',is_nullable,'default',column_default,'precision',numeric_precision,'scale',numeric_scale,'length',character_maximum_length)
   ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND
   (table_name IN ('ProductVariant','ProductVariantSelection') OR
    (table_name='Product' AND column_name IN ('optionMode','variantRevision','materials','materialsEn','materialsDivider')) OR
    (table_name='ProductOption' AND column_name='kind') OR
    (table_name='ProductOptionValue' AND column_name='retiredAt') OR
    (table_name='OrderItem' AND column_name='productVariantId'))),
 'enums',(SELECT jsonb_agg(jsonb_build_object('type',t.typname,'label',e.enumlabel) ORDER BY t.typname,e.enumsortorder)
   FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
   WHERE n.nspname='public' AND t.typname IN ('ProductOptionMode','ProductOptionKind')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'body',md5(p.prosrc),'definer',p.prosecdef,'settings',p.proconfig) ORDER BY p.proname)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'batch18_%'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'type',t.tgtype,'enabled',t.tgenabled,
   'deferred',t.tgdeferrable,'initial',t.tginitdeferred,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname)
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname LIKE 'batch18_%'),
 'foreignKeys',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'valid',k.convalidated,'deferred',k.condeferrable,
   'initial',k.condeferred,'delete',k.confdeltype,'update',k.confupdtype,'reference',rc.relname,
   'columns',array_to_string(ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY x(num,ord)
     JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.num ORDER BY x.ord),','),
   'references',array_to_string(ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY x(num,ord)
     JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.num ORDER BY x.ord),',')) ORDER BY k.conname)
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_class rc ON rc.oid=k.confrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f' AND k.conname IN
   ('OrderItem_productId_productVariantId_fkey','ProductVariant_productId_fkey','ProductVariantSelection_productId_variantId_fkey',
    'ProductVariantSelection_productId_optionId_fkey','ProductVariantSelection_optionId_valueId_fkey')),
 'checks',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'valid',k.convalidated) ORDER BY k.conname)
   FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public' AND k.contype='c' AND k.conname IN
   ('ProductVariant_price_bounds','ProductVariant_id_format','Product_variantRevision_nonnegative')),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('name',i.relname,'valid',x.indisvalid,'ready',x.indisready,'unique',x.indisunique,
   'columns',array_to_string(ARRAY(SELECT a.attname FROM unnest(x.indkey) WITH ORDINALITY z(num,ord)
     JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=z.num ORDER BY z.ord),',')) ORDER BY i.relname)
   FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND i.relname IN
   ('ProductVariant_pkey','ProductVariantSelection_pkey','ProductVariant_productId_retiredAt_isAvailable_idx',
    'ProductVariant_productId_id_key','ProductVariant_productId_combinationKey_key','ProductVariantSelection_optionId_valueId_idx',
    'ProductVariantSelection_productId_variantId_idx','ProductOption_productId_id_key','ProductOption_productId_kind_key',
    'ProductOptionValue_optionId_id_key','OrderItem_productId_productVariantId_idx')));
COMMIT;
'@

# Only synthetic order records, inserted BEFORE expansion in a dedicated clone.
$script:HistorySeedSql = @'
BEGIN;
INSERT INTO public."Product" (id,name,"nameEn",slug,description,price,"categoryId","updatedAt","isActive","isOrderable")
 VALUES ('batch18_history_product','Local history fixture','Local history fixture','batch18-history-fixture','Synthetic local fixture',99,
 (SELECT id FROM public."Category" ORDER BY id LIMIT 1),now(),true,true);
INSERT INTO public."ProductOption" (id,"productId",name) VALUES ('batch18_history_group','batch18_history_product','Size');
INSERT INTO public."ProductOptionValue" (id,"optionId",value,"valueEn",price,"priceModifier") VALUES
 ('batch18_history_small','batch18_history_group','Small','Small',199,987.65),
 ('batch18_history_modifier','batch18_history_group','Unpriced modifier',NULL,NULL,50);
-- Existing acceptance CHECK requires a number for LEGACY orders. Keep this
-- synthetic, unaccepted and provider-free; never allocate a live order number.
INSERT INTO public."Order" (id,number,"checkoutAcceptance","customerName","customerEmail","customerPhone","shippingAddress",city,"postalCode","paymentMethod",subtotal,total)
 VALUES ('batch18_history_order','B18-LOCAL-HISTORY','LEGACY','Synthetic local QA','qa@example.invalid','000','Local fixture','Local fixture','000','LOCAL_TEST_NO_DELIVERY',398,398);
INSERT INTO public."OrderItem" (id,"orderId","productId","productName","optionsJson",price,quantity) VALUES
 ('batch18_history_v1','batch18_history_order','batch18_history_product','Frozen name','{"version":1,"size":{"id":"batch18_history_small","labelUa":"Small","labelEn":"Small"}}',199,1),
 ('batch18_history_flat','batch18_history_order','batch18_history_product','Frozen name','{"Size":"Historical small"}',199,1);
COMMIT;
'@
$script:HistoryCheckSql = @'
BEGIN READ ONLY;
SELECT (SELECT count(*) FROM public."OrderItem" WHERE id IN ('batch18_history_v1','batch18_history_flat') AND "productVariantId" IS NULL AND price=199)=2
 AND (SELECT "optionsJson"::jsonb->>'version' FROM public."OrderItem" WHERE id='batch18_history_v1')='1'
 AND (SELECT "optionsJson"::jsonb->>'Size' FROM public."OrderItem" WHERE id='batch18_history_flat')='Historical small'
 AND (SELECT price=199 AND "priceModifier"=987.65 FROM public."ProductOptionValue" WHERE id='batch18_history_small')
 AND (SELECT price IS NULL AND "priceModifier"=50 FROM public."ProductOptionValue" WHERE id='batch18_history_modifier')
 AND (SELECT "optionMode"='LEGACY' FROM public."Product" WHERE id='batch18_history_product');
COMMIT;
'@

# Every behavioral edit is rolled back; no original product is converted.
$script:BehaviorSql = @'
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SELECT 'B18_NATIVE_SUBSTEP=NativeFixtures';
DO $fixture$
DECLARE mode text; pid text; gid text; val text; key text;
BEGIN
 UPDATE public."Product" SET name=name WHERE id='batch18_history_product';
 IF (SELECT "variantRevision" FROM public."Product" WHERE id='batch18_history_product')<>1 THEN
   RAISE EXCEPTION 'B18_LOCAL_LEGACY_REVISION'; END IF;
 INSERT INTO public."Product" (id,name,slug,description,price,"categoryId","updatedAt","optionMode","isActive","isOrderable")
   VALUES ('batch18_operator_simple','Simple fixture','batch18-operator-simple','Synthetic',123.45,
     (SELECT "categoryId" FROM public."Product" WHERE id='batch18_history_product'),now(),'SIMPLE',true,true);
 FOREACH mode IN ARRAY ARRAY['SIZE','COLOR','COLOR_SIZE'] LOOP
   pid:='batch18_operator_'||lower(mode);
   INSERT INTO public."Product" (id,name,slug,description,price,"categoryId","updatedAt","optionMode","isActive","isOrderable")
     VALUES (pid,'Native fixture',replace(pid,'_','-'),'Synthetic',1,
       (SELECT "categoryId" FROM public."Product" WHERE id='batch18_history_product'),now(),mode::public."ProductOptionMode",true,true);
   key:='';
   IF mode IN ('COLOR','COLOR_SIZE') THEN
     gid:=pid||'_colors'; val:=pid||'_red';
     INSERT INTO public."ProductOption" (id,"productId",name,kind) VALUES (gid,pid,'Color','COLOR');
     INSERT INTO public."ProductOptionValue" (id,"optionId",value,"valueEn") VALUES (val,gid,'Red','Red');
     key:='COLOR='||val;
   END IF;
   IF mode IN ('SIZE','COLOR_SIZE') THEN
     gid:=pid||'_sizes'; val:=pid||'_small';
     INSERT INTO public."ProductOption" (id,"productId",name,kind) VALUES (gid,pid,'Size','SIZE');
     INSERT INTO public."ProductOptionValue" (id,"optionId",value,"valueEn") VALUES (val,gid,'Small','Small');
     key:=key||CASE WHEN key='' THEN '' ELSE ';' END||'SIZE='||val;
   END IF;
   INSERT INTO public."ProductVariant" (id,"productId","combinationKey",price,"isAvailable","updatedAt") VALUES (pid||'_variant',pid,key,199,true,now());
   INSERT INTO public."ProductVariantSelection" ("variantId","productId","optionId","valueId")
     SELECT pid||'_variant',pid,o.id,x.id FROM public."ProductOption" o JOIN public."ProductOptionValue" x ON x."optionId"=o.id WHERE o."productId"=pid;
 END LOOP;
 INSERT INTO public."ProductOptionValue" (id,"optionId",value,"valueEn")
   VALUES ('batch18_operator_color_size_blue','batch18_operator_color_size_colors','Blue','Blue');
END $fixture$;
SELECT 'B18_NATIVE_SUBSTEP=FlushFixtureConstraints';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'B18_NATIVE_SUBSTEP=VariantAndOrderAssertions';
DO $tests$
DECLARE snap text; frozen text; rev integer; failed boolean; policy text;
BEGIN
 IF (SELECT price FROM public."Product" WHERE id='batch18_operator_simple')<>123.45
    OR (SELECT count(*) FROM public."ProductVariantSelection" WHERE "variantId"='batch18_operator_size_variant')<>1
    OR (SELECT count(*) FROM public."ProductVariantSelection" WHERE "variantId"='batch18_operator_color_variant')<>1
    OR (SELECT count(*) FROM public."ProductVariantSelection" WHERE "variantId"='batch18_operator_color_size_variant')<>2 THEN
   RAISE EXCEPTION 'B18_LOCAL_MODE_DIMENSIONS'; END IF;
 IF (SELECT count(*) FROM public."ProductVariant" WHERE "productId"='batch18_operator_color_size')<>1 THEN
   RAISE EXCEPTION 'B18_LOCAL_SPARSE_COMBINATION'; END IF;
 IF (SELECT price FROM public."ProductVariant" WHERE id='batch18_operator_color_size_variant')<>199 OR
    (SELECT price FROM public."Product" WHERE id='batch18_operator_color_size')<>1 THEN RAISE EXCEPTION 'B18_LOCAL_ABSOLUTE_PRICE'; END IF;
 SELECT "variantRevision" INTO rev FROM public."Product" WHERE id='batch18_operator_color_size';
 UPDATE public."ProductVariant" SET price=199 WHERE id='batch18_operator_color_size_variant';
 IF (SELECT "variantRevision" FROM public."Product" WHERE id='batch18_operator_color_size')<=rev THEN RAISE EXCEPTION 'B18_LOCAL_CHILD_EPOCH'; END IF;
 -- A stale editor must reject under the parent lock; the epoch is DB managed.
 PERFORM id FROM public."Product" WHERE id='batch18_operator_color_size' FOR UPDATE;
 IF (SELECT "variantRevision" FROM public."Product" WHERE id='batch18_operator_color_size')=rev THEN RAISE EXCEPTION 'B18_LOCAL_STALE_EPOCH'; END IF;
 failed:=false;
 BEGIN UPDATE public."Product" SET "variantRevision"=0 WHERE id='batch18_operator_color_size';
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_REVISION_RESET_ACCEPTED'; END IF;
 failed:=false;
 BEGIN INSERT INTO public."ProductVariant" (id,"productId","combinationKey",price,"updatedAt")
   SELECT 'batch18_operator_duplicate',"productId","combinationKey",price,now() FROM public."ProductVariant" WHERE id='batch18_operator_color_size_variant';
 EXCEPTION WHEN unique_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_DUPLICATE_ACCEPTED'; END IF;
 failed:=false;
 BEGIN UPDATE public."ProductVariantSelection" SET "valueId"='batch18_operator_color_size_blue' WHERE "variantId"='batch18_operator_color_size_variant' AND "valueId"='batch18_operator_color_size_red';
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_IDENTITY_MUTABLE'; END IF;
 failed:=false;
 BEGIN INSERT INTO public."ProductVariantSelection" ("variantId","productId","optionId","valueId")
   VALUES ('batch18_operator_color_size_variant','batch18_operator_color_size','batch18_operator_size_sizes','batch18_operator_size_small');
 EXCEPTION WHEN foreign_key_violation OR check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_CROSS_PRODUCT_SELECTION'; END IF;
 failed:=false;
 BEGIN UPDATE public."ProductVariant" SET price=0 WHERE id='batch18_operator_color_size_variant';
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_ZERO_PRICE'; END IF;
 failed:=false;
 BEGIN UPDATE public."ProductOptionValue" SET "retiredAt"=now() WHERE id='batch18_operator_color_size_red';
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_ACTIVE_RETIRED_VALUE'; END IF;
 UPDATE public."ProductVariant" SET "retiredAt"=now() WHERE id='batch18_operator_color_size_variant';
 UPDATE public."ProductVariant" SET "retiredAt"=NULL WHERE id='batch18_operator_color_size_variant';
 IF NOT EXISTS (SELECT 1 FROM public."ProductVariant" WHERE id='batch18_operator_color_size_variant' AND "retiredAt" IS NULL) THEN RAISE EXCEPTION 'B18_LOCAL_RESTORE_ID'; END IF;

 SELECT jsonb_build_object('version',2,'variantId','batch18_operator_color_size_variant','dimensions',
   jsonb_agg(jsonb_build_object('kind',o.kind,'optionId',s."optionId",'valueId',s."valueId",'labelUa',x.value,'labelEn',x."valueEn",'noteUa',x.note,'noteEn',x."noteEn") ORDER BY o.kind::text COLLATE "C"))::text INTO snap
 FROM public."ProductVariantSelection" s JOIN public."ProductOption" o ON o.id=s."optionId"
 JOIN public."ProductOptionValue" x ON x.id=s."valueId" WHERE s."variantId"='batch18_operator_color_size_variant';
 INSERT INTO public."Order" (id,number,"checkoutAcceptance","customerName","customerEmail","customerPhone","shippingAddress",city,"postalCode","paymentMethod",subtotal,total)
   VALUES ('batch18_operator_order','B18-LOCAL-NATIVE','LEGACY','Synthetic QA','qa@example.invalid','000','Local','Local','000','LOCAL_TEST_NO_DELIVERY',199,199);
 failed:=false;
 BEGIN INSERT INTO public."OrderItem" (id,"orderId","productId","productVariantId","productName","optionsJson",price,quantity)
   VALUES ('batch18_operator_bad_price','batch18_operator_order','batch18_operator_color_size','batch18_operator_color_size_variant','Frozen',snap,1,1);
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_BASE_PRICE_ACCEPTED'; END IF;
 UPDATE public."ProductVariant" SET "isAvailable"=false WHERE id='batch18_operator_color_size_variant';
 failed:=false;
 BEGIN INSERT INTO public."OrderItem" (id,"orderId","productId","productVariantId","productName","optionsJson",price,quantity)
   VALUES ('batch18_operator_unavailable','batch18_operator_order','batch18_operator_color_size','batch18_operator_color_size_variant','Frozen',snap,199,1);
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_UNAVAILABLE_ACCEPTED'; END IF;
 UPDATE public."ProductVariant" SET "isAvailable"=true WHERE id='batch18_operator_color_size_variant';
 FOREACH policy IN ARRAY ARRAY['retired','inactive','nonorderable','missing'] LOOP
   IF policy='retired' THEN UPDATE public."ProductVariant" SET "retiredAt"=now() WHERE id='batch18_operator_color_size_variant'; END IF;
   IF policy='inactive' THEN UPDATE public."Product" SET "isActive"=false WHERE id='batch18_operator_color_size'; END IF;
   IF policy='nonorderable' THEN UPDATE public."Product" SET "isOrderable"=false WHERE id='batch18_operator_color_size'; END IF;
   failed:=false;
   BEGIN INSERT INTO public."OrderItem" (id,"orderId","productId","productVariantId","productName","optionsJson",price,quantity)
     VALUES ('batch18_operator_blocked_'||policy,'batch18_operator_order','batch18_operator_color_size',
       CASE WHEN policy='missing' THEN NULL ELSE 'batch18_operator_color_size_variant' END,'Frozen',snap,199,1);
   EXCEPTION WHEN check_violation THEN failed:=true; END;
   IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_NATIVE_POLICY_ACCEPTED'; END IF;
   UPDATE public."ProductVariant" SET "retiredAt"=NULL WHERE id='batch18_operator_color_size_variant';
   UPDATE public."Product" SET "isActive"=true,"isOrderable"=true WHERE id='batch18_operator_color_size';
 END LOOP;
 INSERT INTO public."OrderItem" (id,"orderId","productId","productVariantId","productName","optionsJson",price,quantity)
   VALUES ('batch18_operator_item','batch18_operator_order','batch18_operator_color_size','batch18_operator_color_size_variant','Frozen',snap,199,1);
 failed:=false;
 BEGIN UPDATE public."OrderItem" SET "optionsJson"='{}' WHERE id='batch18_operator_item';
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_SNAPSHOT_MUTABLE'; END IF;
 UPDATE public."ProductOptionValue" SET value='Renamed color' WHERE id='batch18_operator_color_size_red';
 SELECT "optionsJson" INTO frozen FROM public."OrderItem" WHERE id='batch18_operator_item';
 IF frozen IS DISTINCT FROM snap THEN RAISE EXCEPTION 'B18_LOCAL_HISTORY_CHANGED'; END IF;
END $tests$;
SELECT 'B18_NATIVE_SUBSTEP=HistoricalOrderDeleteProtection';
DO $history$
DECLARE snap text; failed boolean; blocked_constraint text;
BEGIN
 SELECT "optionsJson" INTO STRICT snap FROM public."OrderItem" WHERE id='batch18_operator_item';
 failed:=false;
 BEGIN DELETE FROM public."Product" WHERE id='batch18_operator_color_size';
 EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
   GET STACKED DIAGNOSTICS blocked_constraint = CONSTRAINT_NAME;
   IF blocked_constraint IS NULL OR blocked_constraint NOT IN
     ('OrderItem_productId_fkey','OrderItem_productId_productVariantId_fkey') THEN RAISE; END IF;
   failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'B18_LOCAL_HISTORY_DELETED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public."Product" WHERE id='batch18_operator_color_size')
    OR NOT EXISTS (SELECT 1 FROM public."ProductVariant" WHERE id='batch18_operator_color_size_variant' AND "productId"='batch18_operator_color_size')
    OR NOT EXISTS (SELECT 1 FROM public."Order" WHERE id='batch18_operator_order')
    OR NOT EXISTS (SELECT 1 FROM public."OrderItem" WHERE id='batch18_operator_item' AND "orderId"='batch18_operator_order'
        AND "productId"='batch18_operator_color_size' AND "productVariantId"='batch18_operator_color_size_variant'
        AND "optionsJson"=snap AND price=199 AND quantity=1)
    OR (SELECT count(*) FROM public."ProductVariantSelection" WHERE "variantId"='batch18_operator_color_size_variant')<>2
 THEN RAISE EXCEPTION 'B18_LOCAL_HISTORY_DAMAGED'; END IF;
 UPDATE public."Product" SET "isActive"=false,"isOrderable"=false WHERE id='batch18_operator_color_size';
 IF NOT EXISTS (SELECT 1 FROM public."OrderItem" WHERE id='batch18_operator_item' AND "optionsJson"=snap) THEN RAISE EXCEPTION 'B18_LOCAL_ARCHIVE_HISTORY'; END IF;
END $history$;
-- Whole-product cascades need the reviewed deferred ownership FKs until flush.
SELECT 'B18_NATIVE_SUBSTEP=UnreferencedProductCascade';
SET CONSTRAINTS ALL DEFERRED;
DELETE FROM public."Product" WHERE id='batch18_operator_color';
SET CONSTRAINTS ALL IMMEDIATE;
DO $cascade$ BEGIN
 IF EXISTS (SELECT 1 FROM public."ProductVariant" WHERE "productId"='batch18_operator_color') THEN RAISE EXCEPTION 'B18_LOCAL_CASCADE_FAILED'; END IF;
END $cascade$;
SELECT 'B18_NATIVE_SUBSTEP=NativeTransactionRollback';
ROLLBACK;
'@
$script:DeferredFailureSql = @'
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public."Product" (id,name,slug,description,price,"categoryId","updatedAt","optionMode")
 VALUES ('batch18_deferred_bad','Deferred fixture','batch18-deferred-bad','Synthetic',1,
   (SELECT id FROM public."Category" ORDER BY id LIMIT 1),now(),'COLOR');
INSERT INTO public."ProductVariant" (id,"productId","combinationKey",price,"updatedAt")
 VALUES ('batch18_deferred_bad_variant','batch18_deferred_bad','FORGED',199,now());
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
'@

# Fixed endpoints and reviewed artifacts; never accept a URL or host parameter.
$script:Baseline = 'restore_3dkid_batch18'
if($FreshProductionRestore){$script:Baseline=Get-RehearsalSource $true}
$script:Psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$script:OwnedDatabases = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$script:LocalPassword = $null; $script:ServerStart = ''; $script:TempDirectory = ''
$runId = [guid]::NewGuid().ToString('N')
$tempRoot = Join-Path $env:LOCALAPPDATA '3dkid-batch18-rehearsal'
$resultRoot = Join-Path $env:LOCALAPPDATA '3dkid-batch18-rehearsal-results'
$resultDirectory = Join-Path $resultRoot $runId
$script:TempDirectory = Join-Path $tempRoot $runId
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:BaselineTables = @('Account','Category','Order','OrderItem','OrderNotification','Product','ProductAttribute','ProductImage','ProductOption','ProductOptionValue','Review','Session','SiteContent','User')
$script:Report = [ordered]@{
    RunId = $runId; StartedUtc = [DateTime]::UtcNow.ToString('o'); Overall = 'NOT_RUN'
    Target = '127.0.0.1:55432'; Source = $script:Baseline; Databases = @(); ArtifactHashes = [ordered]@{}
    Checks = [ordered]@{}; ErrorCode = ''; FailureSubstep = ''; SqlFailure = $null; CompletedUtc = ''; FiveProductsMatched = $false
    Scope = 'SQL migration/compatibility only; no application/provider delivery; no live Production access'
}
foreach ($check in @('ServerIdentity','Baseline','FreshClones','CandidateGuards','Migration','SchemaIntegrity','FiveProducts','LegacyHistory','NativeIntegrity','DeferredFailure','MigrationRollback','SourceUnchanged')) { $script:Report.Checks[$check] = 'NOT_RUN' }
if($FreshProductionRestore){
    $script:Report.Checks.Remove('FiveProducts');$script:Report.Checks.Insert(6,'SixProducts','NOT_RUN')
    $script:Report.Remove('FiveProductsMatched')
    $script:Report['ProductsMatched']=$false;$script:Report['ExpectedProducts']=6
}
# PowerShell names are case-insensitive: never use $baseline for snapshot data,
# because it aliases the protected script-scope $script:Baseline database name.
$phase = 'ServerIdentity'; $exitCode = 1; $baselineSnapshot = $null; $sourceCheckAttempted = $false; $legacySubstep = ''; $nativeSubstep = ''
try {
    New-PrivateDirectory $script:TempDirectory
    [IO.File]::WriteAllText((Join-Path $script:TempDirectory '.owner'), $runId)
    New-PrivateDirectory $resultDirectory
    if (-not (Test-Path -LiteralPath $script:Psql -PathType Leaf)) { Stop-Safe 'PG18_TOOLS_MISSING' }
    $expected = [ordered]@{
        'docs/review/batch-1.8-production-candidate.sql' = 'ca8393bd1add06f51412d6e3096faf63b6c22e8359f884cab6aa3d7af517bf72'
        'docs/review/batch-1.8-neon-preflight-readonly.sql' = '0be460b0027a909716bfc92f05eb71f62ec298fcefa1b9e067d215592882ee8f'
        'docs/review/batch-1.8-variants.sql' = '4c404d4ecb1ed144de4f7886036d0e5f64e7a82e4abe12c344935ac818d05623'
        'docs/review/batch-1.8-variants.prisma' = 'b847306df2e2e0eb1ef349a13034df43e15a3c5713d013cff847f31243291e65'
        'docs/release/batch-1.8-production-migration.sql' = '94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84'
        'docs/release/batch-1.8-production-verify.sql' = 'bba3801a7af4aef9f989c10b351e4a0230d8119621b6b0a43b09022b64bb044c'
    }
    $finalManifest = [IO.File]::ReadAllText((Join-Path $repository 'docs/review/batch-1.8-addendum-manifest.json')) | ConvertFrom-Json
    if ($finalManifest.status -cne 'NOT APPROVED FOR PRODUCTION EXECUTION' -or
        @($finalManifest.artifacts.PSObject.Properties).Count -ne $expected.Count) { Stop-Safe 'FINAL_MANIFEST_REVIEW_REQUIRED' }
    foreach ($file in $expected.Keys) {
        $entry = $finalManifest.artifacts.PSObject.Properties[$file]
        if ($null -eq $entry -or $entry.Value -cne $expected[$file]) { Stop-Safe 'FINAL_MANIFEST_REVIEW_REQUIRED' }
        $hash = (Get-FileHash -LiteralPath (Join-Path $repository $file) -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -cne $expected[$file]) { Stop-Safe 'ARTIFACT_HASH_REVIEW_REQUIRED' }
        $script:Report.ArtifactHashes[$file] = $hash
    }
    $candidate = [IO.File]::ReadAllText((Join-Path $repository 'docs/review/batch-1.8-production-candidate.sql'))
    $productionSql = [IO.File]::ReadAllText((Join-Path $repository 'docs/release/batch-1.8-production-migration.sql'))
    $bodyPattern = '(?s)-- B18_PRESERVED_REVIEW_BODY_BEGIN(?<body>.*?)-- B18_PRESERVED_REVIEW_BODY_END'
    $candidateBody = [regex]::Matches($candidate, $bodyPattern)
    $productionBody = [regex]::Matches($productionSql, $bodyPattern)
    if ($candidateBody.Count -ne 1 -or $productionBody.Count -ne 1 -or
        $candidateBody[0].Groups['body'].Value -cne $productionBody[0].Groups['body'].Value) { Stop-Safe 'PRODUCTION_CANDIDATE_BODY_DIFFERS' }
    $preflight = [IO.File]::ReadAllText((Join-Path $repository 'docs/review/batch-1.8-neon-preflight-readonly.sql'))
    $script:FingerprintSql = ($preflight.Split(@('-- B18_SCHEMA_FINGERPRINT_BEGIN'),[StringSplitOptions]::None)[1].Split(@('-- B18_SCHEMA_FINGERPRINT_END'),[StringSplitOptions]::None)[0]).Trim()
    if ($script:FingerprintSql -notmatch '^SELECT md5' -or $script:FingerprintSql -notmatch 'AS schema_fingerprint') { Stop-Safe 'FINGERPRINT_MARKERS_INVALID' }
    $freshReference=if($FreshProductionRestore){Read-FreshReferenceEvidence}else{$null}
    Write-Host ('LOCAL ONLY: 127.0.0.1:55432; source '+$script:Baseline+' stays read-only.')
    Write-Host 'Three fresh disposable databases will be preserved. No credential files are read or created.'
    $script:LocalPassword = Read-Host 'Enter LOCAL PostgreSQL postgres password (not a Production password)' -AsSecureString
    if ($script:LocalPassword.Length -eq 0) { Stop-Safe 'EMPTY_PASSWORD' }
    $identity = (Require-Success (Invoke-PgSql $script:Baseline @'
BEGIN READ ONLY;
SELECT json_build_object('directory',current_setting('data_directory'),'started',pg_postmaster_start_time(),
 'version',current_setting('server_version'),'role',current_user,'database',current_database());
COMMIT;
'@ $true)) | ConvertFrom-Json
    if ((ConvertTo-LocalPath $identity.directory) -cne 'c:\users\alexa\appdata\local\3dkid-pg18-restore') { Stop-Safe 'DATA_DIRECTORY_MISMATCH' }
    $script:ServerStart = if ($identity.started -is [DateTime]) {
        ([DateTimeOffset]$identity.started).ToString('o')
    } else { ([DateTimeOffset]::Parse([string]$identity.started,[Globalization.CultureInfo]::InvariantCulture)).ToString('o') }
    $script:Report['ServerVersion'] = [string]$identity.version
    Complete-Check $phase

    $phase = 'Baseline'
    $baselineSnapshot = Get-Snapshot $script:Baseline
    if ($baselineSnapshot.tables -ne 14 -or $baselineSnapshot.indexes -ne 31 -or $baselineSnapshot.foreignKeys -ne 11) { Stop-Safe 'BASELINE_COUNTS_DIFFER' }
    if($FreshProductionRestore){
        if($baselineSnapshot.schema -cne $freshReference.Evidence.SchemaFingerprint -or $baselineSnapshot.counts.Product -ne 6){Stop-Safe 'FRESH_REFERENCE_SCHEMA_DIFFERS'}
        foreach($table in $script:BaselineTables){
            if($baselineSnapshot.counts.$table -ne $freshReference.Evidence.Counts.$table -or
               $baselineSnapshot.records.$table -cne $freshReference.Evidence.Digests.$table){Stop-Safe 'FRESH_REFERENCE_DATA_DIFFERS'}
        }
        $script:Report['ReferenceArchiveSha256']=$freshReference.SourceArchiveSha256
        $script:Report['OwnerAclRestoreTested']=$freshReference.OwnerAclRestoreTested
    }elseif($baselineSnapshot.counts.Product -ne 5 -or $baselineSnapshot.counts.ProductOption -ne 0 -or $baselineSnapshot.counts.Order -ne 0){Stop-Safe 'BASELINE_COUNTS_DIFFER'}
    # Fail closed on integration-capable extensions, triggers, subscriptions or FDWs.
    $safe = Require-Success (Invoke-PgSql $script:Baseline @'
BEGIN READ ONLY;
SELECT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal)
 AND NOT EXISTS (SELECT 1 FROM pg_event_trigger)
 AND NOT EXISTS (SELECT 1 FROM pg_subscription)
 AND NOT EXISTS (SELECT 1 FROM pg_foreign_server)
 AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname NOT IN ('plpgsql','pgcrypto','uuid-ossp','pg_stat_statements'))
 AND NOT EXISTS (SELECT 1 FROM public."Product" WHERE id LIKE 'batch18_%')
 AND NOT EXISTS (SELECT 1 FROM pg_index WHERE NOT indisvalid OR NOT indisready);
COMMIT;
'@ $true)
    if ($safe -cne 't') { Stop-Safe 'BASELINE_SIDE_EFFECT_OR_INDEX_REVIEW_REQUIRED' }
    $script:Report['BaselineCounts'] = $baselineSnapshot.counts
    Complete-Check $phase

    $phase = 'FreshClones'
    $successDb = New-RehearsalClone; $rollbackDb = New-RehearsalClone; $compatDb = New-RehearsalClone
    foreach ($db in @($successDb,$rollbackDb,$compatDb)) { Assert-Equal $baselineSnapshot (Get-Snapshot $db) 'CLONE_BASELINE_DIFFERS' }
    Complete-Check $phase

    $phase = 'CandidateGuards'
    $rejected = Invoke-CloneSql $rollbackDb $candidate
    if ($rejected.ExitCode -eq 0 -or $rejected.SqlState -ne 'P0001') { Stop-Safe 'CANDIDATE_GUARD_NOT_REJECTED' }
    Assert-Equal $baselineSnapshot (Get-Snapshot $rollbackDb) 'GUARD_CHANGED_CLONE'
    Complete-Check $phase

    $phase = 'Migration'
    [void](Require-Success (Invoke-Candidate $successDb $baselineSnapshot.schema $candidate))
    $migrated = Get-Snapshot $successDb
    if ($migrated.tables -ne 16 -or $migrated.indexes -ne 42 -or $migrated.foreignKeys -ne 16) { Stop-Safe 'MIGRATED_COUNTS_DIFFER' }
    Complete-Check $phase

    $phase = 'SchemaIntegrity'
    # Definitions and stored bodies are validated below; counts alone are not proof.
    $schema = (Require-Success (Invoke-PgSql $successDb $script:SchemaSql $true)) | ConvertFrom-Json
    if ($schema.columns.Count -ne 20 -or $schema.enums.Count -ne 7 -or $schema.functions.Count -ne 5 -or
        $schema.triggers.Count -ne 11 -or $schema.foreignKeys.Count -ne 5 -or $schema.checks.Count -ne 3 -or $schema.indexes.Count -ne 11) { Stop-Safe 'NATIVE_OBJECT_SET_DIFFERS' }
    $columnTypes = @{
        'Product.materials'='text'; 'Product.materialsEn'='text'; 'Product.materialsDivider'='varchar'
        'Product.optionMode'='ProductOptionMode'; 'Product.variantRevision'='int4'; 'ProductOption.kind'='ProductOptionKind'
        'ProductOptionValue.retiredAt'='timestamp'; 'OrderItem.productVariantId'='text'
        'ProductVariant.id'='text'; 'ProductVariant.productId'='text'; 'ProductVariant.combinationKey'='varchar'; 'ProductVariant.price'='numeric'
        'ProductVariant.isAvailable'='bool'; 'ProductVariant.retiredAt'='timestamp'; 'ProductVariant.createdAt'='timestamp'; 'ProductVariant.updatedAt'='timestamp'
        'ProductVariantSelection.variantId'='text'; 'ProductVariantSelection.productId'='text'; 'ProductVariantSelection.optionId'='text'; 'ProductVariantSelection.valueId'='text'
    }
    $nullable = @('Product.materials','Product.materialsEn','Product.materialsDivider','ProductOption.kind','ProductOptionValue.retiredAt','OrderItem.productVariantId','ProductVariant.retiredAt')
    foreach ($column in $schema.columns) {
        $key = $column.table + '.' + $column.name
        $nullability = if ($nullable -contains $key) { 'YES' } else { 'NO' }
        if (-not $columnTypes.ContainsKey($key) -or $column.type -cne $columnTypes[$key] -or $column.nullable -cne $nullability) { Stop-Safe 'NATIVE_COLUMN_DEFINITION_DIFFERS' }
        if ($key -eq 'Product.materialsDivider' -and $column.length -ne 128) { Stop-Safe 'MOTIF_LENGTH_DIFFERS' }
        if ($key -eq 'ProductVariant.price' -and ($column.precision -ne 10 -or $column.scale -ne 2)) { Stop-Safe 'PRICE_PRECISION_DIFFERS' }
        if ($key -eq 'ProductVariant.combinationKey' -and $column.length -ne 300) { Stop-Safe 'KEY_LENGTH_DIFFERS' }
        if ($key -eq 'Product.optionMode' -and $column.default -notmatch 'LEGACY') { Stop-Safe 'LEGACY_DEFAULT_DIFFERS' }
        if ($key -eq 'Product.variantRevision' -and $column.default -ne '0') { Stop-Safe 'EPOCH_DEFAULT_DIFFERS' }
        if ($key -eq 'ProductVariant.isAvailable' -and $column.default -ne 'false') { Stop-Safe 'AVAILABILITY_DEFAULT_DIFFERS' }
    }
    Assert-Equal @('COLOR','SIZE') @($schema.enums | Where-Object { $_.type -eq 'ProductOptionKind' } | ForEach-Object { $_.label }) 'KIND_ENUM_DIFFERS'
    Assert-Equal @('LEGACY','SIMPLE','SIZE','COLOR','COLOR_SIZE') @($schema.enums | Where-Object { $_.type -eq 'ProductOptionMode' } | ForEach-Object { $_.label }) 'MODE_ENUM_DIFFERS'
    $indexDefinitions = @{
        'ProductVariant_pkey'=@('id',$true); 'ProductVariantSelection_pkey'=@('variantId,optionId',$true)
        'ProductVariant_productId_retiredAt_isAvailable_idx'=@('productId,retiredAt,isAvailable',$false)
        'ProductVariant_productId_id_key'=@('productId,id',$true); 'ProductVariant_productId_combinationKey_key'=@('productId,combinationKey',$true)
        'ProductVariantSelection_optionId_valueId_idx'=@('optionId,valueId',$false); 'ProductVariantSelection_productId_variantId_idx'=@('productId,variantId',$false)
        'ProductOption_productId_id_key'=@('productId,id',$true); 'ProductOption_productId_kind_key'=@('productId,kind',$true)
        'ProductOptionValue_optionId_id_key'=@('optionId,id',$true); 'OrderItem_productId_productVariantId_idx'=@('productId,productVariantId',$false)
    }
    foreach ($row in $schema.indexes) {
        if (-not $row.valid -or -not $row.ready -or -not $indexDefinitions.ContainsKey($row.name) -or
            $row.columns -cne $indexDefinitions[$row.name][0] -or $row.unique -ne $indexDefinitions[$row.name][1]) { Stop-Safe 'NATIVE_INDEX_INVALID' }
    }
    foreach ($row in $schema.foreignKeys) { if (-not $row.valid -or $row.update -ne 'r') { Stop-Safe 'NATIVE_FK_INVALID' } }
    $deferred = @($schema.foreignKeys | Where-Object { $_.deferred -and $_.initial -and $_.delete -eq 'a' })
    if ($deferred.Count -ne 2) { Stop-Safe 'DEFERRED_OWNERSHIP_FK_DIFFERS' }
    $fkDefinitions = @{
        'OrderItem_productId_productVariantId_fkey'=@('productId,productVariantId','ProductVariant','productId,id','r')
        'ProductVariant_productId_fkey'=@('productId','Product','id','c')
        'ProductVariantSelection_productId_variantId_fkey'=@('productId,variantId','ProductVariant','productId,id','c')
        'ProductVariantSelection_productId_optionId_fkey'=@('productId,optionId','ProductOption','productId,id','a')
        'ProductVariantSelection_optionId_valueId_fkey'=@('optionId,valueId','ProductOptionValue','optionId,id','a')
    }
    foreach ($row in $schema.foreignKeys) {
        $expectedFk = $fkDefinitions[$row.name]
        if ($row.columns -cne $expectedFk[0] -or $row.reference -cne $expectedFk[1] -or $row.references -cne $expectedFk[2] -or $row.delete -cne $expectedFk[3]) { Stop-Safe 'FK_OWNERSHIP_OR_ACTION_DIFFERS' }
    }
    foreach ($row in $schema.checks) { if (-not $row.valid) { Stop-Safe 'NATIVE_CHECK_INVALID' } }
    foreach ($row in $schema.triggers) {
        $expectedType = switch ($row.name) { 'batch18_product_guard' { 19 } 'batch18_child_guard' { 31 } 'batch18_integrity' { if ($row.table -eq 'Product') { 17 } else { 29 } } 'batch18_order_snapshot_guard' { 23 } default { -1 } }
        if ($row.enabled -ne 'O' -or $row.type -ne $expectedType -or
            ($row.name -eq 'batch18_integrity' -and (-not $row.deferred -or -not $row.initial))) { Stop-Safe 'NATIVE_TRIGGER_DEFINITION_DIFFERS' }
    }
    $bodies = [regex]::Matches($candidate, '(?s)CREATE FUNCTION public\.(?<name>batch18_[a-z_]+)\(.*?\) RETURNS \w+.*?AS \$\$(?<body>.*?)\$\$;')
    if ($bodies.Count -ne 5) { Stop-Safe 'GUARD_BODY_PARSE_FAILED' }
    foreach ($function in $bodies) {
        $stored = @($schema.functions | Where-Object { $_.name -ceq $function.Groups['name'].Value })
        $md5 = [Security.Cryptography.MD5]::Create()
        try { $expectedBody = ([BitConverter]::ToString($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($function.Groups['body'].Value)))).Replace('-','').ToLowerInvariant() } finally { $md5.Dispose() }
        if ($stored.Count -ne 1 -or $stored[0].body -cne $expectedBody -or $stored[0].definer -or
            -not ($stored[0].settings -contains 'search_path=pg_catalog')) { Stop-Safe 'GUARD_BODY_OR_CONTEXT_DIFFERS' }
    }
    Complete-Check $phase

    $phase = if($FreshProductionRestore){'SixProducts'}else{'FiveProducts'}
    Assert-DataPreserved $baselineSnapshot $migrated
    if($FreshProductionRestore){$script:Report.ProductsMatched=$true}else{$script:Report.FiveProductsMatched = $true}
    Complete-Check $phase

    $phase = 'LegacyHistory'
    $legacySubstep = 'SeedFixtures'
    [void](Require-Success (Invoke-CloneSql $compatDb $script:HistorySeedSql))
    $legacySubstep = 'CaptureSeededSnapshot'
    $history = Get-Snapshot $compatDb
    $legacySubstep = 'MigrateSeededClone'
    [void](Require-Success (Invoke-Candidate $compatDb $history.schema $candidate))
    $legacySubstep = 'CompareSeededData'
    Assert-DataPreserved $history (Get-Snapshot $compatDb)
    $legacySubstep = 'VerifyHistoricalSnapshots'
    $historyCheck = Require-Success (Invoke-PgSql $compatDb $script:HistoryCheckSql $true)
    if ($historyCheck -cne 't') { Stop-Safe 'LEGACY_SNAPSHOT_OR_PRICE_DIFFERS' }
    Complete-Check $phase

    $phase = 'NativeIntegrity'
    $nativeSubstep = 'BehaviorSql'
    [void](Require-Success (Invoke-CloneSql $compatDb $script:BehaviorSql))
    $nativeSubstep = 'VerifyNativeRollback'
    Assert-DataPreserved $history (Get-Snapshot $compatDb)
    Complete-Check $phase

    $phase = 'DeferredFailure'
    $bad = Invoke-CloneSql $successDb $script:DeferredFailureSql
    if ($bad.ExitCode -eq 0 -or $bad.SqlState -ne '23514') { Stop-Safe 'DEFERRED_FAILURE_NOT_CAUGHT' }
    Assert-Equal $migrated (Get-Snapshot $successDb) 'FAILED_SAVE_NOT_ROLLED_BACK'
    Complete-Check $phase

    $phase = 'MigrationRollback'
    if ($candidate -notmatch 'COMMIT;\s*$') { Stop-Safe 'ROLLBACK_INJECTION_FAILED' }
    $injection = @'
DO $rollback$ BEGIN RAISE EXCEPTION USING ERRCODE='B1801',MESSAGE='B18_REHEARSAL_FORCED_ROLLBACK'; END $rollback$;
COMMIT;
'@
    $forced = $candidate.Substring(0,$candidate.LastIndexOf('COMMIT;',[StringComparison]::Ordinal)) + $injection
    $failed = Invoke-Candidate $rollbackDb $baselineSnapshot.schema $forced
    if ($failed.ExitCode -eq 0 -or $failed.SqlState -ne 'B1801') { Stop-Safe 'FORCED_ROLLBACK_NOT_REACHED' }
    Assert-Equal $baselineSnapshot (Get-Snapshot $rollbackDb) 'MIGRATION_ROLLBACK_DIFFERS'
    Complete-Check $phase

    $phase = 'SourceUnchanged'
    $sourceCheckAttempted = $true
    Assert-Equal $baselineSnapshot (Get-Snapshot $script:Baseline) 'PROTECTED_BASELINE_CHANGED'
    Complete-Check $phase
    $script:Report.Overall = 'PASS'; $exitCode = 0
} catch {
    $safeCode = if ($_.Exception.Message -match '^B18_OP_[A-Z0-9_]+$') { $_.Exception.Message } else { 'B18_OP_UNEXPECTED_FAILURE_DETAILS_SUPPRESSED' }
    $script:Report.ErrorCode = $safeCode
    if ($phase -eq 'LegacyHistory') { $script:Report.FailureSubstep = $legacySubstep }
    if ($phase -eq 'NativeIntegrity' -and -not $script:Report.FailureSubstep) { $script:Report.FailureSubstep = $nativeSubstep }
    $status = if ($phase -in @('ServerIdentity','Baseline')) { 'BLOCKED' } else { 'FAIL' }
    $script:Report.Checks[$phase] = $status; $script:Report.Overall = $status
    foreach ($name in @($script:Report.Checks.Keys)) { if ($script:Report.Checks[$name] -eq 'NOT_RUN') { $script:Report.Checks[$name] = 'BLOCKED' } }
    Write-Host ("$status at ${phase}: $safeCode (raw diagnostics suppressed)")
    if ($script:Report.FailureSubstep) { Write-Host ('Failing substep: ' + $script:Report.FailureSubstep) }
    if ($script:Report.SqlFailure) { Write-Host ('SQL identifier: ' + $script:Report.SqlFailure.Identifier) }
    if ($script:Report.SqlFailure -and $script:Report.SqlFailure.Source) {
        Write-Host ('SQL source: ' + $script:Report.SqlFailure.Source + ':' + $script:Report.SqlFailure.SourceLine + ' [' + $script:Report.SqlFailure.Statement + ']')
    }
} finally {
    if ($baselineSnapshot -and $script:LocalPassword -and -not $sourceCheckAttempted -and
        $script:Report.ErrorCode -notmatch '^B18_OP_SQL_(AUTH|28P01|28000)$') {
        try { Assert-Equal $baselineSnapshot (Get-Snapshot $script:Baseline) 'PROTECTED_BASELINE_CHANGED'; Complete-Check 'SourceUnchanged' }
        catch { $script:Report.Checks['SourceUnchanged'] = 'FAIL'; $script:Report.Overall = 'FAIL'; $exitCode = 1 }
    }
    if ($script:LocalPassword) { $script:LocalPassword.Dispose(); $script:LocalPassword = $null }
    try {
        if (Test-Path -LiteralPath $script:TempDirectory) {
            Assert-OwnedTempDirectory $script:TempDirectory $tempRoot $runId
            $temporaryFiles = @(Get-ChildItem -LiteralPath $script:TempDirectory -Force)
            foreach ($temporaryFile in $temporaryFiles) {
                if ($temporaryFile.PSIsContainer -or ($temporaryFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                    ($temporaryFile.Name -ne '.owner' -and $temporaryFile.Name -notmatch '^[a-f0-9]{32}\.sql$')) { Stop-Safe 'UNEXPECTED_TEMP_ENTRY' }
            }
            foreach ($temporaryFile in $temporaryFiles) { Remove-Item -LiteralPath $temporaryFile.FullName -Force }
            Remove-Item -LiteralPath $script:TempDirectory -Force
        }
    } catch { Write-Host 'Temporary SQL cleanup requires operator review; no credentials were written there.'; $script:Report.Overall = 'FAIL'; $script:Report.ErrorCode = 'B18_OP_TEMP_CLEANUP_FAILED'; $exitCode = 1 }
    $script:Report.CompletedUtc = [DateTime]::UtcNow.ToString('o')
    try {
        if (Test-Path -LiteralPath $resultDirectory) {
            $resultFile = Join-Path $resultDirectory 'result.json'
            [IO.File]::WriteAllText($resultFile, ($script:Report | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
            Write-Host ("Sanitized result: " + $resultFile)
        }
    } catch {
        Write-Host 'Result-file write failed; no raw error emitted.'
        $script:Report.Overall = 'FAIL'; $script:Report.ErrorCode = 'B18_OP_RESULT_WRITE_FAILED'; $exitCode = 1
    }
    Write-Host ("Overall: " + $script:Report.Overall + "; exit code: " + $exitCode)
    Write-Host 'No database cleanup performed. Rehearsal databases remain for inspection.'
    foreach ($database in $script:Report.Databases) { Write-Host ("Rehearsal target: " + $database) }
}
exit $exitCode
