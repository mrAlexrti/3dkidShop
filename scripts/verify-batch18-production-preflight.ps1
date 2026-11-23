# OFFLINE ONLY. Loads function definitions; no prompt, client, credentials or DB.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$file=Join-Path $PSScriptRoot 'operator\batch18-production-preflight.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Preflight PowerShell syntax invalid.'}
foreach($definition in $ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){. ([scriptblock]::Create($definition.Extent.Text))}
$script:ExpectedTables=@('Account','Category','Order','OrderItem','OrderNotification','Product','ProductAttribute','ProductImage','ProductOption','ProductOptionValue','Review','Session','SiteContent','User')
$passed=0
function Check([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Pass([string]$Message){$script:passed++;Write-Output "PASS preflight offline $script:passed`: $Message"}
function Rejects([scriptblock]$Action){$rejected=$false;try{& $Action|Out-Null}catch{$rejected=$true};Check $rejected 'Expected rejection.'}
$fixtureDirectory=Join-Path $PSScriptRoot ('..\.next\cache\batch18-preflight-tls-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixtureDirectory)
$fixtureSql=Join-Path $fixtureDirectory 'readonly.sql';$fixtureRoot=Join-Path $fixtureDirectory 'trusted-roots.pem'
$rsa=[Security.Cryptography.RSACng]::new(2048);$certificate=$null
try {
 $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Batch18 offline synthetic CA',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
 $certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1),[DateTimeOffset]::UtcNow.AddDays(1))
 $bundle=Convert-PreflightRootCertificates @($certificate,$certificate)
 Check ($bundle.CertificateCount -eq 1 -and $bundle.Sha256 -ceq (Get-TextHash $bundle.Pem)) 'Duplicate roots or incorrect bundle hash.'
 Check ($bundle.Pem -match '^-----BEGIN CERTIFICATE-----' -and $bundle.Pem -notmatch 'PRIVATE KEY') 'Public roots export invalid.'
 $encoded=$bundle.Pem.Replace('-----BEGIN CERTIFICATE-----','').Replace('-----END CERTIFICATE-----','')
 $roundtrip=[Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($encoded))
 try {Check (-not $roundtrip.HasPrivateKey -and [Convert]::ToBase64String($roundtrip.RawData) -ceq [Convert]::ToBase64String($certificate.RawData)) 'Certificate bytes changed or private key exported.'}finally{$roundtrip.Dispose()}
 Rejects {Convert-PreflightRootCertificates @()}
 [IO.File]::WriteAllText($fixtureRoot,$bundle.Pem,[Text.UTF8Encoding]::new($false))
} finally {if($certificate){$certificate.Dispose()};$rsa.Dispose()}
$target=[pscustomobject]@{ProjectId='fixture-project';BranchId='br-fixture';DirectHost='ep-fixture.eu-central-1.aws.neon.tech';Database='fixture';AuditRole='audit';MigrationRole='migrator';ApplicationRole='runtime';VercelHost='ep-fixture-pooler.eu-central-1.aws.neon.tech';VercelDatabase='fixture';VercelRole='runtime';VercelSchema='public';DeployedCommit='76621cf01ebe482bfee9a80aaed4a4b5b9dfed22';BaselineFingerprint=('a'*32)}
Assert-Target $target
Pass 'PowerShell parsed; operator-attested pooled/direct metadata tuple matches.'
foreach($field in @('DirectHost','VercelHost','Database','VercelDatabase','ApplicationRole','VercelRole','VercelSchema','DeployedCommit','BaselineFingerprint')){
 $old=$target.$field;$target.$field=if($field -in @('DirectHost','VercelHost')){'postgresql://PRIVATE:DO_NOT_PRINT@wrong.invalid/db'}else{'wrong'}
 try{Rejects {Assert-Target $target}}finally{$target.$field=$old}
}
$old=$target.DirectHost;$target.DirectHost=$target.VercelHost;try{Rejects {Assert-Target $target}}finally{$target.DirectHost=$old}
Pass 'URLs, mismatched deployment/DB/role/schema/fingerprint and pooled administrative hosts fail before auth.'

$sentinel='SYNTHETIC_CREDENTIAL_DO_NOT_PRINT';$secure=ConvertTo-SecureString $sentinel -AsPlainText -Force
$info=$null
try{
 $info=New-PreflightClient $target $fixtureSql $secure $fixtureRoot
 Check ($info.Arguments -notmatch $sentinel -and $info.Arguments -match '--csv' -and $info.Arguments -match '"-w"') 'Credential appeared in arguments or client could prompt unexpectedly.'
 Check ($info.EnvironmentVariables['PGPASSWORD'] -ceq $sentinel -and $info.EnvironmentVariables['PGSSLMODE'] -ceq 'verify-full') 'Child-only credential/TLS policy invalid.'
 Check ($info.EnvironmentVariables['PGSSLROOTCERT'] -ceq $fixtureRoot -and $info.EnvironmentVariables['LC_ALL'] -ceq 'C' -and -not $info.EnvironmentVariables.ContainsKey('SSL_CERT_FILE') -and -not $info.EnvironmentVariables.ContainsKey('SSL_CERT_DIR')) 'Explicit Windows root snapshot or deterministic TLS diagnostics missing.'
 Rejects {New-PreflightClient $target $fixtureSql $secure}
 Rejects {New-PreflightClient $target $fixtureSql $secure (Join-Path $fixtureDirectory 'other.pem')}
 Check ($info.EnvironmentVariables['PGOPTIONS'] -match 'default_transaction_read_only=on') 'Read-only session defense missing.'
 Check ($info.EnvironmentVariables['PGPASSFILE'].EndsWith('DO-NOT-CREATE.pgpass') -and -not $info.UseShellExecute -and $info.CreateNoWindow) 'Credential fallback or visible child enabled.'
 Clear-PreflightClient $info
 Check (-not $info.EnvironmentVariables.ContainsKey('PGPASSWORD')) 'Child credential not cleared.'
}finally{if($info){Clear-PreflightClient $info};$secure.Dispose()}
Pass 'Synthetic SecureString only: child-env password, noninteractive client, TLS, no passfile fallback and cleanup; no process launched.'

$guard=Get-PreflightGuard $target
Check ($guard -match '^BEGIN READ ONLY;' -and $guard -match 'current_database\(\)' -and $guard -match 'pg_is_in_recovery' -and $guard -match 'pg_foreign_table' -and $guard -match 'relrowsecurity' -and $guard -match 'relkind IN') 'Read-only identity/external/RLS/base-table guards missing.'
Check ($guard -notmatch '__DATABASE__|__ROLE__|DO \$ BEGIN|END \$;') 'Literal replacement or dollar quote broken.'
Pass 'Generated prefix is read-only with guarded DB/role/primary identity, foreign-table and RLS checks.'

function Csv([string[]]$Cells){return (($Cells|ForEach-Object {'"'+$_.Replace('"','""')+'"'}) -join ',')}
$sections=Get-PreflightSections;$raw=[Collections.Generic.List[string]]::new()
$counts=[ordered]@{};foreach($name in $script:ExpectedTables){$counts[$name]=0};$counts.Product=27;$counts.Category=8;$counts.ProductImage=54;$counts.Order=3
foreach($signature in @($sections.Keys|Sort-Object)){
 $section=$sections[$signature];if($section -in @('HistoryEntries','UnfinishedMigrations')){continue}
 $headers=$signature -split '\|';$raw.Add((Csv $headers))
 if($section -in @('Tables','Columns','Constraints','Indexes','Triggers','Enums','Roles','TablePermissions','Extensions','Activity')){continue}
 $cells=foreach($header in $headers){switch($header){
  'database_name'{$target.Database} 'connection_role'{$target.AuditRole} 'server_version'{'18.7'} 'is_replica'{'f'} 'read_only'{'on'}
  'schema_fingerprint'{'a'*32} 'jsonb_object_agg'{$counts|ConvertTo-Json -Compress}
  'prisma_migration_history'{'ABSENT: repository currently uses reviewed manual SQL'}
  {$_ -in @('migration_schema_create','migration_schema_usage','migration_plpgsql_usage','runtime_schema_create')}{'t'} default{'0'}
 }}
 $raw.Add((Csv $cells))
}
$csv=$raw -join "`n"
$evidence=Convert-PreflightCsv $csv $target
Check ($evidence.Counts[0].jsonb_object_agg.Product -eq 27 -and $evidence.Counts[0].jsonb_object_agg.Order -eq 3) 'Live counts were forced to backup fixture counts.'
Check ($evidence.Identity[0].read_only -eq $true -and $evidence.HistoryAbsent[0].prisma_migration_history -ceq 'ABSENT') 'Typed report conversion failed.'
Rejects {Convert-PreflightCsv ($csv+"`n"+(Csv @('unrecognized','header'))) $target}
Rejects {Convert-PreflightCsv ($csv.Replace('"read_only"','"unexpected"')) $target}
Rejects {Convert-PreflightCsv ($csv.Replace('"on"','"off"')) $target}
Pass 'CSV headers/schema enforced; typed aggregate counts accept a larger live catalog; write-mode and malformed outputs rejected.'

$private='postgresql://person:PRIVATE_SECRET@private.invalid/customer';$metadata=Convert-SafeCell 'migration_name' $private $target
Check ($metadata -cmatch '^sha256:[a-f0-9]{64}$' -and $metadata -notmatch 'PRIVATE|postgresql') 'Dynamic metadata leaked.'
Rejects {Convert-SafeCell 'schema_fingerprint' $private $target}
Rejects {Convert-SafeCell 'sessions' '-1' $target}
Rejects {Convert-SafeCell 'is_replica' 'unknown' $target}
Rejects {Convert-SafeCell 'oldest_transaction_age' $private $target}
Pass 'Dynamic metadata is hashed; raw URI/error/data, bad hashes, negative counts and unknown booleans never become report fields.'

foreach($pair in @(@('FATAL:  28P01: PRIVATE_SECRET','SQL_28P01'),@('ERROR:  B18P1: PRIVATE_SECRET','TARGET_IDENTITY_OR_PRIMARY_MISMATCH'),@('ERROR:  B18P2: PRIVATE_SECRET','EXTERNAL_OR_RLS_REVIEW_REQUIRED'),@('ERROR:  B18P3: PRIVATE_SECRET','EXPECTED_BASE_TABLES_MISSING_OR_VIEWS'),@('SSL error: PRIVATE_SECRET','TLS_VERIFICATION_FAILED'),@('PRIVATE_SECRET','SQL_CLIENT'))){Check ((Get-PreflightClientError $pair[0]) -ceq $pair[1]) 'Error classification leaked or misclassified data.'}
foreach($pair in @(
 @('server certificate for "PRIVATE" does not match host name "PRIVATE"','TLS_HOSTNAME_MISMATCH'),
 @('root certificate file "PRIVATE" does not exist','TLS_ROOT_CONFIGURATION_FAILED'),
 @('could not load system root certificates: PRIVATE','TLS_ROOT_CONFIGURATION_FAILED'),
 @('could not read root certificate file "PRIVATE": PRIVATE','TLS_ROOT_CONFIGURATION_FAILED'),
 @('could not load private key file "PRIVATE"','TLS_CLIENT_CERTIFICATE_CONFIGURATION_FAILED'),
 @('SSL error: certificate verify failed: unable to get local issuer certificate','TLS_ISSUER_NOT_TRUSTED'),
 @('SSL error: certificate verify failed: self-signed certificate in certificate chain','TLS_ISSUER_NOT_TRUSTED'),
 @('SSL error: certificate verify failed: certificate has expired','TLS_CERTIFICATE_EXPIRED'),
 @('SSL error: certificate verify failed: certificate is not yet valid','TLS_CERTIFICATE_NOT_YET_VALID'),
 @('SSL error: certificate verify failed: certificate revoked','TLS_CERTIFICATE_REVOKED'),
 @('SSL error: certificate verify failed: PRIVATE_SECRET','TLS_CHAIN_VERIFICATION_FAILED')
)){Check ((Get-PreflightClientError $pair[0]) -ceq $pair[1]) 'TLS subtype leaked or misclassified data.'}
Pass 'Authentication, TLS, guarded identity/RLS/base-table and unknown errors become fixed codes without raw diagnostics.'

$findings=@(Get-PreflightFindings $evidence $target)
Check ($findings -contains 'BASELINE_OBJECT_SET_DIFFERS' -and $findings -contains 'FRESH_VERIFIED_BACKUP_AND_EXPLICIT_OWNER_APPROVAL_REQUIRED') 'Collection was mistaken for migration approval.'
$evidence.Fingerprint[0].schema_fingerprint='b'*32
Check (@(Get-PreflightFindings $evidence $target) -contains 'SCHEMA_FINGERPRINT_DIFFERS') 'Drift was silently accepted.'
Pass 'Schema drift/object-count issues are findings; every collection remains unapproved for migration.'

$source=[IO.File]::ReadAllText($file)
Check ($source -match 'Read-Host[^\r\n]+-AsSecureString' -and $source -match 'ZeroFreeBSTR' -and $source -match 'password.Dispose' -and $source -match 'Clear-PreflightClient') 'Secure prompt/finally lifecycle incomplete.'
Check ($source -notmatch '\$env:PG\w*\s*=|DROP DATABASE|CREATE DATABASE|initdb|pg_dump|pg_restore|Set-Content|Start-Transcript|DATABASE_URL\s*=') 'Unexpected write, backup, credential or transcript operation.'
Check ($source -match 'VERBOSITY=sqlstate' -and $source -match 'raw diagnostics suppressed' -and $source -match 'MigrationApproved=\$false') 'Failure sanitization/approval separation missing.'
Check ($source -notmatch 'Remove-Item[^\r\n]+-Recurse|Write-Host[^\r\n]+\$(stdout|stderr|password)') 'Raw output/credential or recursive deletion found.'
$sql=Join-Path $PSScriptRoot '..\docs\release\batch-1.8-production-preflight.sql'
Check ((Get-FileHash -LiteralPath $sql -Algorithm SHA256).Hash.ToLowerInvariant() -ceq '64139191343df170888a22af34f298cebd5fe61d8064d9b313ab7362791e0284') 'Verified source SQL changed.'
Check ((Read-VerifiedPreflightSql $sql) -ceq [IO.File]::ReadAllText($sql)) 'Captured verified SQL differs.'
Check ($source -match '\$verifiedSql=Read-VerifiedPreflightSql \$source' -and $source -match '\$sql=\(Get-PreflightGuard \$target\)\+"`n"\+\$verifiedSql' -and $source -notmatch 'ReadAllText\(\$source\)') 'SQL is reread after hash verification.'
Pass 'Same captured SQL bytes verified/executed, no backups/writes/parent-env changes, sanitized error/finally lifecycle and no unsafe deletion.'

$shared=[ordered]@{SharedDatabase=$true;ProjectName='';BranchName='';ProjectId='';BranchId='';DirectHost=$target.DirectHost;VercelHost=$target.VercelHost;Database='';AuditRole='';MigrationRole='';ApplicationRole='';VercelDatabase='';VercelRole='';VercelSchema='';DeployedCommit=$target.DeployedCommit;BaselineFingerprint=$target.BaselineFingerprint}
Set-ConfirmedSharedDefaults $shared
$sharedTarget=[pscustomobject]$shared; Assert-Target $sharedTarget
Check ($sharedTarget.ProjectName -ceq 'StikerSuite' -and $sharedTarget.BranchName -ceq 'production' -and $sharedTarget.Database -ceq 'neondb' -and $sharedTarget.AuditRole -ceq 'neondb_owner' -and $sharedTarget.ApplicationRole -ceq 'neondb_owner') 'Confirmed shared configuration not retained.'
foreach($field in @('ProjectName','BranchName','Database','AuditRole','MigrationRole','ApplicationRole','VercelRole','VercelDatabase','VercelSchema')){
 $old=$sharedTarget.$field;$sharedTarget.$field='wrong';try{Rejects {Assert-Target $sharedTarget}}finally{$sharedTarget.$field=$old}
}
$sharedTarget.ProjectId='wrong:URI';try{Rejects {Assert-Target $sharedTarget}}finally{$sharedTarget.ProjectId=''}
$conflict=[ordered]@{Database='other'};Rejects {Set-ConfirmedSharedDefaults $conflict};Check ($conflict.Database -ceq 'other') 'Conflicting supplied target was silently overwritten.'
$old=$target.ProjectId;$target.ProjectId='';try{Rejects {Assert-Target $target}}finally{$target.ProjectId=$old}
$secure=ConvertTo-SecureString 'SYNTHETIC_OWNER_PASSWORD' -AsPlainText -Force;$info=$null
try{$info=New-PreflightClient $sharedTarget $fixtureSql $secure $fixtureRoot;Check ($info.Arguments -match '"-U" "neondb_owner"' -and $info.Arguments -match '"-d" "neondb"' -and $info.EnvironmentVariables['PGOPTIONS'] -match 'default_transaction_read_only=on') 'Owner collector changed target or read-only policy.'}finally{if($info){Clear-PreflightClient $info};$secure.Dispose()}
Pass 'Confirmed one-database profile accepts neondb_owner with read-only controls; names recorded correctly, optional IDs validated, generic and target mismatch guards preserved.'
Check ($source -match "X509Store\]::new\('Root'" -and $source -match 'ReadOnly, OpenExistingOnly' -and $source -match '\$certificate.RawData' -and $source -notmatch 'Export\(|Import\(|\.Add\(\$certificate\).*store|Download(?:File|String)|Invoke-WebRequest') 'Trust anchors must come only from existing read-only Windows root stores.'
Check ($source -match 'TLS_ROOT_BUNDLE_REQUIRED' -and $source -match 'Remove-Item -LiteralPath \$rootCertificatePath -Force' -and $source -notmatch "PGSSLMODE'\]='(?:require|prefer|disable|verify-ca)'|PGSSLROOTCERT'\]='system'") 'TLS verification downgraded, missing roots accepted, or temporary CA bundle retained.'
Remove-Item -LiteralPath $fixtureRoot -Force
[IO.Directory]::Delete([IO.Path]::GetFullPath($fixtureDirectory))
Pass 'Synthetic public CA round-trip/deduplication, empty store rejection, owned bundle requirement, strict verify-full and TLS subtype reporting; no certificate-store writes or network.'
Write-Output "PASS production preflight OFFLINE: $passed groups. No operator main, password prompt, client, network, database or backup executed."
