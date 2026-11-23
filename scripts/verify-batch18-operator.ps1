# Offline only: parse the operator file and load FUNCTION DEFINITIONS, never its main.
# No PostgreSQL client process, prompt, credential file or database is used.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$file = Join-Path $PSScriptRoot 'operator\batch18-rehearse.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Operator PowerShell syntax validation failed.' }
$functions = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)
foreach ($definition in $functions) { . ([scriptblock]::Create($definition.Extent.Text)) }
$passed = 0
function Check([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Pass([string]$Message) { $script:passed++; Write-Output ("PASS offline $script:passed`: $Message") }
function Rejects([scriptblock]$Action) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Check $rejected 'Expected fail-closed rejection.'
}
Pass ('Windows PowerShell ' + $PSVersionTable.PSVersion + ': parsed operator script without execution.')

$script:Baseline = 'restore_3dkid_batch18'
$script:OwnedDatabases = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$script:ServerStart = '2026-11-18T20:38:57.1234560+00:00'
$script:Psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$script:TempDirectory = Join-Path $PSScriptRoot '..\.next\cache\batch18-operator-script-qa'

# Reproduce the real script-scope initialization, not a hand-written helper setup.
# PowerShell variable names are case-insensitive: $baseline used to erase
# $script:Baseline before the first read-only call ever reached a client process.
$initializers = @($ast.EndBlock.Statements | Where-Object {
    $_ -is [Management.Automation.Language.AssignmentStatementAst] -and
    $_.Left -is [Management.Automation.Language.VariableExpressionAst] -and
    $_.Left.VariablePath.UserPath -imatch '^(script:)?baseline(snapshot)?$'
})
Check ($initializers.Count -eq 2) 'Expected protected-name and snapshot initializers.'
foreach ($initializer in $initializers) {
    Check ($initializer.Right.Extent.Text -ceq "'restore_3dkid_batch18'" -or
        $initializer.Right.Extent.Text -ceq '$null') 'Unexpected initialization expression; refuse execution.'
    . ([scriptblock]::Create($initializer.Extent.Text))
}
Check ($script:Baseline -ceq 'restore_3dkid_batch18') 'Regression: snapshot initialization erased the protected baseline database name.'
Check ($null -eq $baselineSnapshot) 'Snapshot must initialize separately from the protected database name.'

$mainTry = @($ast.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.TryStatementAst] })[0]
$identityCall = @($mainTry.Body.FindAll({ param($node)
    $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'Invoke-PgSql'
}, $true))[0]
Check ($identityCall.Extent.Text -match 'json_build_object' -and
    $identityCall.Extent.Text -match '\$script:Baseline') 'Could not locate actual ServerIdentity call.'
$savedProcessInfo = ${function:New-PgProcessInfo}
$savedTempDirectory = $script:TempDirectory
$bindingRoot = [IO.Path]::GetFullPath((Join-Path $script:TempDirectory 'binding'))
$bindingDirectory = Join-Path $bindingRoot ([guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($bindingDirectory)
$script:TempDirectory = $bindingDirectory
$script:BoundCalls = @()
function New-PgProcessInfo([string]$Database, [string]$SqlFile, [bool]$ReadOnly) {
    $script:BoundCalls += [pscustomobject]@{ Database=$Database; ReadOnly=$ReadOnly; SqlFile=$SqlFile }
    throw 'OFFLINE_STOP_BEFORE_PROCESS_CREATION'
}
try {
    # Execute the unchanged call expression through the REAL Invoke-PgSql helper.
    # The mocked boundary throws before Process creation, without any password.
    $stopped = $false
    try { & ([scriptblock]::Create($identityCall.Extent.Text)) | Out-Null }
    catch { Check ($_.Exception.Message -ceq 'OFFLINE_STOP_BEFORE_PROCESS_CREATION') 'ServerIdentity failed before the intended offline boundary.'; $stopped=$true }
    Check ($stopped -and $script:BoundCalls.Count -eq 1) 'Read-only identity call did not reach the safe mocked boundary.'
    $bound = $script:BoundCalls[0]
    Check ($bound.Database -ceq 'restore_3dkid_batch18' -and $bound.ReadOnly) 'ServerIdentity parameter binding lost the baseline name or read-only flag.'
    $identitySql = [IO.File]::ReadAllText($bound.SqlFile)
    Check ($identitySql.Contains("current_database()<>'restore_3dkid_batch18'") -and
        $identitySql.Contains('180007') -and $identitySql.Contains('55432') -and
        $identitySql.Contains('c:/users/alexa/appdata/local/3dkid-pg18-restore') -and
        $identitySql.Contains($script:ServerStart)) 'ServerIdentity SQL lost exact instance guards.'
    Rejects { Invoke-PgSql -Database $script:Baseline -Sql 'SELECT 1;' -ReadOnly $false }
    Rejects { Invoke-CloneSql -Database $script:Baseline -Sql 'SELECT 1;' }
    Check ($script:BoundCalls.Count -eq 1) 'A baseline write reached the client boundary.'
    Rejects { Invoke-PgSql -Database ('batch18_rehearsal_' + ('a' * 32)) -Sql 'SELECT 1;' -ReadOnly $false }
    Check ($script:BoundCalls.Count -eq 1) 'An unowned disposable write reached the client boundary.'
} finally {
    Set-Item -Path Function:New-PgProcessInfo -Value $savedProcessInfo
    $script:TempDirectory = $savedTempDirectory
    foreach ($temporary in @(Get-ChildItem -LiteralPath $bindingDirectory -File)) {
        Check ($temporary.DirectoryName -ceq $bindingDirectory -and $temporary.Name -match '^[a-f0-9]{32}\.sql$') 'Unexpected offline fixture cleanup target.'
        Remove-Item -LiteralPath $temporary.FullName
    }
    [IO.Directory]::Delete($bindingDirectory,$false)
}
Pass 'Actual script initialization and ServerIdentity binding preserve baseline read-only access; writes and unowned clones remain refused.'

Check ((ConvertTo-NativeArguments @('-d','local db','-f','C:\local folder\a.sql')) -ceq '"-d" "local db" "-f" "C:\local folder\a.sql"') 'Native quoting differs.'
Rejects { ConvertTo-NativeArguments @("bad`narg") }
Rejects { ConvertTo-NativeArguments @('bad"argument') }
Check ((ConvertTo-LocalPath 'C:/Users/alexa/AppData/Local/3dkid-pg18-restore/') -ceq 'c:\users\alexa\appdata\local\3dkid-pg18-restore') 'Path normalization differs.'
$guard = Get-IdentityGuard $script:Baseline
Check ($guard.Contains('inet_server_addr()') -and $guard.Contains('55432') -and $guard.Contains('180007') -and
    $guard.Contains('c:/users/alexa/appdata/local/3dkid-pg18-restore') -and $guard.Contains($script:ServerStart)) 'Identity guard incomplete.'
Pass 'Native argument safety and exact local directory/port/version/server-start guard.'

Rejects { Assert-Clone $script:Baseline }
Rejects { Assert-Clone 'postgresql://production/anything' }
Rejects { Assert-Clone ('batch18_rehearsal_' + ('a' * 32)) }
$owned = 'batch18_rehearsal_' + ('b' * 32)
[void]$script:OwnedDatabases.Add($owned)
Assert-Clone $owned
Pass 'Baseline, connection strings and prefix-only unowned names cannot be write targets.'

$fake = [guid]::NewGuid().ToString('N')
$script:LocalPassword = ConvertTo-SecureString -String $fake -AsPlainText -Force
$info = $null
try {
    $info = New-PgProcessInfo $script:Baseline 'C:\safe temp\query.sql' $true
    Check (-not $info.UseShellExecute -and $info.CreateNoWindow -and $info.RedirectStandardError -and $info.RedirectStandardOutput) 'Client process isolation incomplete.'
    Check ($info.EnvironmentVariables['PGPASSWORD'] -ceq $fake) 'Child authentication missing.'
    Check (-not $info.Arguments.Contains($fake) -and -not $info.Arguments.Contains('PGPASSWORD')) 'Password in client arguments.'
    Check ($info.EnvironmentVariables['PGOPTIONS'].Contains('default_transaction_read_only=on')) 'Baseline not connection-level read-only.'
    Check ($info.EnvironmentVariables['PGPASSFILE'].EndsWith('DO-NOT-CREATE.pgpass')) 'Existing passfile could be consulted.'
    Check (-not $info.EnvironmentVariables.ContainsKey('PGSERVICE')) 'Inherited service alias retained.'
    Clear-PgProcessInfo $info
    Check (-not $info.EnvironmentVariables.ContainsKey('PGPASSWORD') -and -not $info.EnvironmentVariables.ContainsKey('PGPASSFILE')) 'Child environment not cleared.'
    Rejects { New-PgProcessInfo $script:Baseline 'C:\safe\query.sql' $false }
    Rejects { New-PgProcessInfo ('batch18_rehearsal_' + ('a' * 32)) 'C:\safe\query.sql' $true }
    Rejects { New-PgProcessInfo ('batch18_rehearsal_' + ('a' * 32)) 'C:\safe\query.sql' $false }
} finally {
    if ($info) { Clear-PgProcessInfo $info }
    $script:LocalPassword.Dispose(); $script:LocalPassword = $null; $fake = $null
}
Pass 'Generated fake SecureString only: child-env authentication/cleanup, no process launched or credential file read.'

# Mock the client boundary, then exercise the actual clone helper. No SQL execution.
$script:Calls = 0
function Invoke-PgSql([string]$Database, [string]$Sql, [bool]$ReadOnly) {
    $script:Calls++
    Check ($Database -eq 'postgres' -or $script:OwnedDatabases.Contains($Database)) 'Unexpected helper target.'
    if ($Database -eq 'postgres') { Check ($Sql -cmatch '^CREATE DATABASE "batch18_rehearsal_[a-f0-9]{32}" WITH TEMPLATE "restore_3dkid_batch18";$') 'Clone statement changed.' }
    Check (-not $ReadOnly) 'Write helper mode changed.'
    return [pscustomobject]@{ ExitCode=0; SqlState=''; Output='' }
}
$script:Report = [ordered]@{ Databases=@() }
$one = New-RehearsalClone; $two = New-RehearsalClone
Check ($one -cne $two -and $script:OwnedDatabases.Contains($one) -and $script:Report.Databases.Count -eq 2) 'Fresh clone tracking failed.'
$count = $script:Calls
Rejects { Invoke-CloneSql $script:Baseline 'SELECT 1;' }
Check ($script:Calls -eq $count) 'Protected source reached mock write client.'
[void](Invoke-CloneSql $one 'SELECT 1;')
Pass 'Mocked boundary: unique fresh clone statements, run ownership and protected-source write rejection.'

$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.next\cache\batch18-operator-script-qa\temp-unit'))
[void][IO.Directory]::CreateDirectory($qaRoot)
$id = [guid]::NewGuid().ToString('N'); $qaDirectory = Join-Path $qaRoot $id
[void][IO.Directory]::CreateDirectory($qaDirectory)
try {
    [IO.File]::WriteAllText((Join-Path $qaDirectory '.owner'),$id)
    Assert-OwnedTempDirectory $qaDirectory $qaRoot $id
    Rejects { Assert-OwnedTempDirectory $qaRoot $qaRoot $id }
    Rejects { Assert-OwnedTempDirectory $qaDirectory $qaRoot ('c' * 32) }
} finally {
    Remove-Item -LiteralPath (Join-Path $qaDirectory '.owner')
    [IO.Directory]::Delete($qaDirectory,$false)
}
Pass 'Temporary cleanup requires exact generated parent, leaf and ownership marker; no recursive deletion.'

$source = [IO.File]::ReadAllText($file)
Check ($source -match 'Read-Host[^\r\n]+-AsSecureString' -and $source -match 'ZeroFreeBSTR' -and $source -match 'LocalPassword\.Dispose') 'Secure prompt/finally cleanup missing.'
Check ($source -notmatch '\$env:PG\w*\s*=' -and $source -notmatch 'DROP DATABASE|pg_terminate_backend|initdb|PGPASSWORD[^\r\n]+Arguments') 'Unsafe environment/lifecycle statement.'
Check ($source -match 'Assert-Clone \$Database' -and $source -match 'MAINTENANCE_WRITE_REFUSED') 'Write backstops missing.'
Check ($source -match "SqlState -ne 'B1801'" -and $source -match "SqlState -ne '23514'") 'Expected failure states not checked.'
Check ($source -match 'Assert-Equal \$baselineSnapshot \(Get-Snapshot \$rollbackDb\)' -and $source -match 'Assert-Equal \$baselineSnapshot \(Get-Snapshot \$script:Baseline\)') 'Rollback/baseline evidence missing.'
Check ($source -notmatch 'Remove-Item[^\r\n]+-Recurse') 'Recursive cleanup unexpectedly added.'
Pass 'Static lifecycle audit: prompt/zero-free/finally, expected rollback SQLSTATE, no DB drops/auth bypass/parent env mutation.'

# Offline fixture regression against the EXISTING database CHECK definition.
# This evaluates its small, known boolean grammar; it is not PostgreSQL execution.
$acceptanceDdl = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\prisma\changes\batch-1-7-4a-checkout-acceptance.sql'))
$acceptanceMatch = [regex]::Match($acceptanceDdl, '(?s)ADD CONSTRAINT "Order_checkout_acceptance_check" CHECK \((?<check>.*?)\);')
Check $acceptanceMatch.Success 'Existing checkout acceptance CHECK not found.'
Check ($acceptanceDdl -match '"checkoutAcceptance"[^\r\n]+DEFAULT ''LEGACY''') 'Expected LEGACY database default.'
function Test-FixtureAcceptance([hashtable]$Row) {
    # checkoutAcceptance is NOT NULL; all compared values are fixed enum literals.
    Check ($null -ne $Row.checkoutAcceptance) 'Acceptance must be non-null for this fixture evaluator.'
    foreach ($clause in ($acceptanceMatch.Groups['check'].Value -split '\bOR\b')) {
        $accepted = $true
        foreach ($term in ($clause -split '\bAND\b')) {
            $term = $term.Trim().Trim('(',')').Trim()
            if ($term -cmatch '^"(checkoutAcceptance)" = ''(LEGACY|ACCEPTED|PROVISIONAL|REVIEW)''$') {
                $accepted = $accepted -and ($Row[$Matches[1]] -ceq $Matches[2])
            } elseif ($term -cmatch '^"(number|acceptedAt|paymentReference)" IS (NOT )?NULL$') {
                $present = $null -ne $Row[$Matches[1]]
                $required = $Matches[2] -ceq 'NOT '
                $accepted = $accepted -and ($present -eq $required)
            } else { throw 'CHECK grammar changed: review offline evaluator before using it.' }
        }
        if ($accepted) { return $true }
    }
    return $false
}
Check (-not (Test-FixtureAcceptance @{checkoutAcceptance='LEGACY';number=$null;acceptedAt=$null;paymentReference=$null})) 'Original unnumbered LEGACY fixture must violate the existing CHECK.'
$fixtureNumbers = @()
foreach ($fixtureName in @('HistorySeedSql','BehaviorSql')) {
    $assignment = @($ast.EndBlock.Statements | Where-Object {
        $_ -is [Management.Automation.Language.AssignmentStatementAst] -and $_.Left.Extent.Text -ceq ('$script:' + $fixtureName)
    })[0]
    $literal = @($assignment.Right.FindAll({ param($node) $node -is [Management.Automation.Language.StringConstantExpressionAst] }, $true))
    Check ($literal.Count -eq 1) 'Expected literal SQL fixture; refuse executing dynamic SQL.'
    $orderInsert = [regex]::Matches($literal[0].Value, '(?s)INSERT INTO public\."Order"\s*\((?<columns>[^)]+)\)\s*VALUES\s*\((?<values>[^;]+)\);')
    Check ($orderInsert.Count -eq 1) 'Expected exactly one synthetic Order insert per fixture.'
    $columns = @($orderInsert[0].Groups['columns'].Value.Split(',') | ForEach-Object { $_.Trim().Trim('"') })
    $values = @($orderInsert[0].Groups['values'].Value.Split(',') | ForEach-Object { $_.Trim() })
    Check ($columns.Count -eq $values.Count) 'Synthetic order literal column/value mismatch.'
    $row = @{ checkoutAcceptance='LEGACY';number=$null;acceptedAt=$null;paymentReference=$null }
    for ($i=0; $i -lt $columns.Count; $i++) {
        $value = $values[$i]
        if ($value -cmatch '^''([^'']*)''$') { $row[$columns[$i]] = $Matches[1] }
        elseif ($value -ceq 'NULL') { $row[$columns[$i]] = $null }
        elseif ($value -match '^\d+(\.\d+)?$') { $row[$columns[$i]] = $value }
        else { throw 'Unsupported fixture literal: review offline parser.' }
    }
    Check (Test-FixtureAcceptance $row) ($fixtureName + ': synthetic Order violates Order_checkout_acceptance_check (the original 23514 failure).')
    Check ($row.checkoutAcceptance -ceq 'LEGACY' -and $row.paymentMethod -ceq 'LOCAL_TEST_NO_DELIVERY' -and
        $null -eq $row.acceptedAt -and $null -eq $row.paymentReference) 'Fixture must remain unaccepted and provider-free.'
    Check ($columns -contains 'number' -and $columns -contains 'checkoutAcceptance') 'Fixture acceptance fields must be explicit.'
    $fixtureNumbers += $row.number
}
Check ($fixtureNumbers[0] -cne $fixtureNumbers[1]) 'Synthetic fixture order numbers must be distinct.'
Pass 'Existing checkout CHECK rejects the original unnumbered LEGACY fixture and accepts both corrected provider-free fixtures (offline evaluation only).'

$privateSentinel = 'SYNTHETIC_PRIVATE_ROW_MUST_NOT_APPEAR'
$diagnostic = @"
psql:C:/private/query.sql:12: ERROR:  23514: new row violates check constraint
DETAIL: Failing row contains ($privateSentinel).
SCHEMA NAME: public
TABLE NAME: Order
CONSTRAINT NAME: Order_checkout_acceptance_check
LOCATION: ExecConstraints, execMain.c:1
"@
$safe = Get-SafePgFailure $diagnostic
Check ($safe.SqlState -ceq '23514' -and $safe.Identifier -ceq 'Order_checkout_acceptance_check') 'Known CHECK diagnostic not classified.'
Check (-not (($safe | ConvertTo-Json -Compress).Contains($privateSentinel))) 'Private diagnostic leaked.'
$guard = Get-SafePgFailure 'psql:C:/private/query.sql:12: ERROR:  23514: B18_IMMUTABLE_ORDER_SNAPSHOT'
Check ($guard.SqlState -ceq '23514' -and $guard.Identifier -ceq 'B18_IMMUTABLE_ORDER_SNAPSHOT') 'Known guard diagnostic not classified.'
$unknown = Get-SafePgFailure ("ERROR:  23514: " + $privateSentinel + "`nCONSTRAINT NAME: " + $privateSentinel)
Check ($unknown.Identifier -ceq 'UNCLASSIFIED') 'Unknown identifier must not enter results.'
$detailsOnly = Get-SafePgFailure "ERROR:  23514: unknown error`nDETAIL: B18_IMMUTABLE_ORDER_SNAPSHOT"
Check ($detailsOnly.Identifier -ceq 'UNCLASSIFIED') 'DETAIL content must not be treated as a guard error header.'
$savedReport = $script:Report
try {
    $script:Report = [ordered]@{ SqlFailure=$null }
    $caught = ''
    try { Require-Success ([pscustomobject]@{ExitCode=3;SqlState=$safe.SqlState;Identifier=$safe.Identifier;Output=''}) | Out-Null }
    catch { $caught=$_.Exception.Message }
    Check ($caught -ceq 'B18_OP_SQL_23514' -and $script:Report.SqlFailure.Identifier -ceq 'Order_checkout_acceptance_check') 'Failure report lost safe constraint context.'
    Check (-not (($script:Report | ConvertTo-Json -Compress).Contains($privateSentinel))) 'Report contains raw diagnostic data.'
} finally { $script:Report = $savedReport }
Check ($source -match "'VERBOSITY=verbose'" -and $source -match 'Get-SafePgFailure \$stderr') 'Diagnostic extraction not connected to real psql boundary.'
foreach ($substep in @('SeedFixtures','CaptureSeededSnapshot','MigrateSeededClone','CompareSeededData','VerifyHistoricalSnapshots')) {
    Check ($source.Contains("`$legacySubstep = '$substep'")) ('Missing LegacyHistory substep: '+$substep)
}
Check ($source -match 'if \(\$phase -eq ''LegacyHistory''\) \{ \$script:Report.FailureSubstep = \$legacySubstep \}') 'Failing substep not copied into sanitized report.'
Pass 'Known CHECK/guard identifiers and LegacyHistory substeps are retained; raw rows and unknown messages are excluded.'

# Offline PL/pgSQL handler dispatch model, using the ACTUAL protected-delete block.
# PostgreSQL 18's documented RESTRICT SQLSTATE is 23001, not 23503.
$behaviorAssignment = @($ast.EndBlock.Statements | Where-Object {
    $_ -is [Management.Automation.Language.AssignmentStatementAst] -and $_.Left.Extent.Text -ceq '$script:BehaviorSql'
})[0]
$behavior = @($behaviorAssignment.Right.FindAll({ param($node) $node -is [Management.Automation.Language.StringConstantExpressionAst] }, $true))[0].Value
$protectedDelete = [regex]::Match($behavior, '(?s)BEGIN DELETE FROM public\."Product" WHERE id=''batch18_operator_color_size'';(?<handler>.*?)END;')
Check $protectedDelete.Success 'Actual historical-product delete assertion not found.'
$conditions = [regex]::Match($protectedDelete.Groups['handler'].Value, 'EXCEPTION WHEN (?<conditions>[a-z_]+(?: OR [a-z_]+)*) THEN')
Check $conditions.Success 'Expected explicit exception-condition list.'
$codes = @{foreign_key_violation='23503';restrict_violation='23001'}
$handledCodes = @($conditions.Groups['conditions'].Value -split ' OR ' | ForEach-Object {
    Check ($codes.ContainsKey($_)) 'Unexpected broad exception condition in protected-delete assertion.'
    $codes[$_]
})
Check ($handledCodes -contains '23001') 'Regression: actual protected-delete handler does not catch PostgreSQL 18 restrict_violation (23001).'
Check ($handledCodes.Count -eq 2 -and $handledCodes -contains '23503') 'Protected-delete handler must cover exactly the two FK rejection states.'
Check (($behavior | Select-String -Pattern '\brestrict_violation\b' -AllMatches).Matches.Count -eq 1) 'RESTRICT must not be broadly suppressed elsewhere.'
$handler = $protectedDelete.Groups['handler'].Value
Check ($handler -match 'GET STACKED DIAGNOSTICS blocked_constraint\s*=\s*CONSTRAINT_NAME' -and
    $handler -match '(?s)blocked_constraint NOT IN\s*\((?<names>.*?)\) THEN RAISE; END IF;') 'Expected constraint-specific rejection and bare rethrow for unrelated failures.'
$expectedConstraints = @([regex]::Matches($Matches['names'], '''([^'']+)''') | ForEach-Object { $_.Groups[1].Value })
Assert-Equal @('OrderItem_productId_fkey','OrderItem_productId_productVariantId_fkey') $expectedConstraints 'HISTORICAL_FK_WHITELIST_DIFFERS'
function Test-ProtectedDeleteDispatch([string]$State,[string]$Constraint) {
    return ($handledCodes -contains $State -and $expectedConstraints -ccontains $Constraint)
}
foreach ($constraint in $expectedConstraints) {
    Check (Test-ProtectedDeleteDispatch '23001' $constraint) 'Expected RESTRICT rejection must count as protected.'
    Check (Test-ProtectedDeleteDispatch '23503' $constraint) 'Expected legacy FK rejection must count as protected.'
}
Check (-not (Test-ProtectedDeleteDispatch '23001' 'Unrelated_fkey')) 'Unrelated RESTRICT rejection must fail the test.'
Check (-not (Test-ProtectedDeleteDispatch '23514' $expectedConstraints[0])) 'CHECK/guard failures must not be accepted as FK protection.'
Check ($behavior -match '(?s)B18_LOCAL_HISTORY_DELETED.*?public\."Product".*?public\."ProductVariant".*?public\."Order".*?public\."OrderItem".*?public\."ProductVariantSelection".*?B18_LOCAL_HISTORY_DAMAGED') 'Deletion rejection must also verify retained parent, variant, order, immutable item and selections.'
Pass 'Actual delete assertion accepts only historical FK rejection states/constraints, including PostgreSQL 18 23001; unrelated failures remain fatal (offline model).'

$progress = "B18_NATIVE_SUBSTEP=NativeFixtures`nB18_NATIVE_SUBSTEP=VariantAndOrderAssertions`nB18_NATIVE_SUBSTEP=HistoricalOrderDeleteProtection`n"
$restrictDiagnostic = "ERROR:  23001: protected reference`nDETAIL: " + $privateSentinel + "`nCONSTRAINT NAME: OrderItem_productId_productVariantId_fkey"
$nativeFailure = Get-SafePgFailure $restrictDiagnostic $progress
Check ($nativeFailure.SqlState -ceq '23001' -and $nativeFailure.Identifier -ceq 'OrderItem_productId_productVariantId_fkey' -and
    $nativeFailure.NativeSubstep -ceq 'HistoricalOrderDeleteProtection') 'Native diagnostic must identify exact attempted substep and historical FK.'
$unknownProgress = Get-SafePgFailure $restrictDiagnostic ($progress + "B18_NATIVE_SUBSTEP=UnreviewedStage`n")
Check ($unknownProgress.NativeSubstep -ceq '') 'Unknown progress marker must not be reported or mistaken for an earlier stage.'
$embeddedProgress = Get-SafePgFailure $restrictDiagnostic '{"body":"B18_NATIVE_SUBSTEP=HistoricalOrderDeleteProtection"}'
Check ($embeddedProgress.NativeSubstep -ceq '') 'Row/JSON content must not be interpreted as a progress marker.'
$savedReport = $script:Report
try {
    $script:Report = [ordered]@{SqlFailure=$null;FailureSubstep=''}
    $caught = ''
    try { Require-Success ([pscustomobject]@{ExitCode=3;SqlState=$nativeFailure.SqlState;Identifier=$nativeFailure.Identifier;NativeSubstep=$nativeFailure.NativeSubstep;Output=''}) | Out-Null }
    catch { $caught=$_.Exception.Message }
    Check ($caught -ceq 'B18_OP_SQL_23001') 'Client boundary must never broadly swallow SQLSTATE 23001.'
    Check ($script:Report.FailureSubstep -ceq 'HistoricalOrderDeleteProtection') 'Native substep not copied to sanitized report.'
    Check (-not (($script:Report | ConvertTo-Json -Compress).Contains($privateSentinel))) 'Native diagnostic leaked private row data.'
} finally { $script:Report=$savedReport }
$nativeMarkers = @([regex]::Matches($behavior, "SELECT 'B18_NATIVE_SUBSTEP=([A-Za-z]+)';") | ForEach-Object { $_.Groups[1].Value })
Assert-Equal @('NativeFixtures','FlushFixtureConstraints','VariantAndOrderAssertions','HistoricalOrderDeleteProtection','UnreferencedProductCascade','NativeTransactionRollback') $nativeMarkers 'NATIVE_MARKER_ORDER_DIFFERS'
Check ($source -match 'Get-SafePgFailure \$stderr \$stdout' -and
    $source -match '\$nativeSubstep = ''VerifyNativeRollback''') 'Actual client progress and rollback-verification fallback not connected.'
Check ($behavior -match 'SELECT "optionsJson" INTO STRICT snap FROM public\."OrderItem" WHERE id=''batch18_operator_item''') 'Protected-delete assertion must use the saved immutable snapshot, not renamed current labels.'
Pass 'Native failure progress is allowlisted, ordered and private; unhandled 23001 remains fatal at the client boundary.'

# Final combined rehearsal must bind the release manifest too, and detect category
# edits even when product/category counts are unchanged. No client is executed.
$pins = @($mainTry.Body.Statements | Where-Object {
    $_ -is [Management.Automation.Language.AssignmentStatementAst] -and
    $_.Left -is [Management.Automation.Language.VariableExpressionAst] -and
    $_.Left.VariablePath.UserPath -ceq 'expected'
})
Check ($pins.Count -eq 1 -and $pins[0].Right.Extent.Text -match '^\[ordered\]@\{') 'Expected literal reviewed artifact map.'
. ([scriptblock]::Create($pins[0].Extent.Text))
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = [IO.File]::ReadAllText((Join-Path $repository 'docs/review/batch-1.8-addendum-manifest.json')) | ConvertFrom-Json
Check ($expected.Count -eq 6 -and @($manifest.artifacts.PSObject.Properties).Count -eq 6) 'All six final manifest artifacts must be pinned.'
foreach ($path in $expected.Keys) {
    Check ($manifest.artifacts.PSObject.Properties[$path].Value -ceq $expected[$path]) 'Manifest and operator pins differ.'
    Check ((Get-FileHash -LiteralPath (Join-Path $repository $path) -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $expected[$path]) 'Pinned artifact content differs.'
}
Check ($source -match 'FINAL_MANIFEST_REVIEW_REQUIRED' -and $source -match 'PRODUCTION_CANDIDATE_BODY_DIFFERS') 'Manifest/body checks must run before prompting or connecting.'
Check ($source -match "'categories',\(SELECT md5\(coalesce\(jsonb_agg\(to_jsonb\(c\) ORDER BY id\)") 'Category row digest is missing from snapshots.'
$before = [pscustomobject]@{ counts=@{Category=2}; products=@{}; categories='unchanged'; images='same'; attributes='same';records=@{ProductOptionValue='price-digest'} }
$after = [pscustomobject]@{ counts=@{Category=2}; products=@{}; categories='unchanged'; images='same'; attributes='same';records=@{ProductOptionValue='price-digest'} }
Assert-DataPreserved $before $after
$after.categories = 'same-count-unsafe-reparenting'
$failureCode = ''
try { Assert-DataPreserved $before $after } catch { $failureCode = $_.Exception.Message }
Check ($failureCode -ceq 'B18_OP_PRESERVATION_CATEGORIES') 'Same-count category edits escaped preservation checking.'
Pass 'Final six-artifact manifest is pinned, release/candidate bodies are checked and same-count category mutation fails preservation.'

$savedCloneSql = ${function:Invoke-CloneSql}
$fixtureDatabase = 'batch18_rehearsal_' + ('d' * 32)
[void]$script:OwnedDatabases.Add($fixtureDatabase)
try {
    function Invoke-CloneSql([string]$Database, [string]$Sql, [object[]]$SourceMap) { return $Sql }
    $assembled = Invoke-Candidate $fixtureDatabase ('a' * 32) 'SELECT 1;'
    Check ($assembled -cmatch '(?s)^DO \$settings\$ BEGIN.*?END \$settings\$;\r?\nSELECT 1;$') 'Actual client settings assembly has invalid dollar quoting.'
    Check ($assembled.Contains("set_config('batch18.expected_database','$fixtureDatabase',false)")) 'Candidate settings binding changed.'
} finally { ${function:Invoke-CloneSql}=$savedCloneSql; [void]$script:OwnedDatabases.Remove($fixtureDatabase) }
Pass 'Actual Invoke-Candidate assembles valid tagged client settings; synthetic marker remains exact and no client runs.'

$candidateSource = [IO.File]::ReadAllText((Join-Path $repository 'docs/review/batch-1.8-production-candidate.sql'))
$candidateRows = @($candidateSource -split '\r?\n')
$categoryLine = 0
for ($i=0; $i -lt $candidateRows.Count; $i++) { if ($candidateRows[$i].Contains('B18_CATEGORY_DELETION_NOT_PROTECTED')) { $categoryLine=$i+1 } }
Check ($categoryLine -gt 0) 'Category postcheck fixture not found.'
$settingsLines=9; $prefixLines=11
$maps = @(New-CandidateSourceMap $candidateSource $settingsLines)
$generatedPath = Join-Path $env:TEMP 'batch18-offline-location.sql'
$reportedLine = $prefixLines+$settingsLines+$categoryLine
$syntaxDiagnostic = "psql:${generatedPath}:${reportedLine}: ERROR:  42601: $privateSentinel`nLINE 1: $privateSentinel"
$located = Get-SafePgFailure $syntaxDiagnostic '' $generatedPath $prefixLines ($settingsLines+$candidateRows.Count) $maps
Check ($located.SqlState -ceq '42601' -and $located.Identifier -ceq 'CATEGORY_DELETE_POSTCHECK' -and
    $located.Source -ceq 'docs/review/batch-1.8-production-candidate.sql' -and $located.SourceLine -eq $categoryLine) 'Generated-file offsets did not map to the safe source statement/line.'
Check (-not (($located | ConvertTo-Json -Compress).Contains($privateSentinel))) 'Syntax diagnostics leaked raw SQL/error data.'
$untrusted = Get-SafePgFailure ($syntaxDiagnostic.Replace($generatedPath,'unrelated-private-file.sql')) '' $generatedPath $prefixLines ($settingsLines+$candidateRows.Count) $maps
Check ($untrusted.Source -ceq '' -and $untrusted.Identifier -ceq 'UNCLASSIFIED') 'Unrelated paths must not control source classification.'
$outside = Get-SafeSqlLocation ($syntaxDiagnostic.Replace(":${reportedLine}:",':999999:')) $generatedPath $prefixLines ($settingsLines+$candidateRows.Count) $maps
Check ($outside.Source -ceq '') 'Unbounded diagnostic line accepted.'
$savedReport = $script:Report
try {
    $script:Report=[ordered]@{SqlFailure=$null;FailureSubstep=''}
    $failureCode=''
    try { Require-Success ([pscustomobject]@{ExitCode=3;SqlState=$located.SqlState;Identifier=$located.Identifier;NativeSubstep='';Statement=$located.Statement;Source=$located.Source;SourceLine=$located.SourceLine;Output=''}) | Out-Null } catch { $failureCode=$_.Exception.Message }
    Check ($failureCode -ceq 'B18_OP_SQL_42601' -and $script:Report.SqlFailure.SourceLine -eq $categoryLine) 'Syntax failure was suppressed or its safe location discarded.'
} finally { $script:Report=$savedReport }
Pass '42601 maps to allowlisted candidate postcheck/source line with offsets; raw SQL, unrelated paths and out-of-range lines are excluded; failure remains fatal.'
$freshSource=Get-RehearsalSource $true
Check ($freshSource -ceq 'batch18_backup_verify_bded0676ab034ceeb0fc874a2b409005' -and (Get-RehearsalSource $false) -ceq 'restore_3dkid_batch18') 'Source allowlist changed.'
$savedBaseline=$script:Baseline;$savedInvoke=${function:Invoke-PgSql};$script:FreshCalls=@()
try{
 $script:Baseline=$freshSource
 function Invoke-PgSql([string]$Database,[string]$Sql,[bool]$ReadOnly){
  $script:FreshCalls+=[pscustomobject]@{Database=$Database;Sql=$Sql;ReadOnly=$ReadOnly}
  return [pscustomobject]@{ExitCode=0;SqlState='';Output=''}
 }
 $freshClone=New-RehearsalClone
 Check ($script:FreshCalls.Count -eq 1 -and $script:FreshCalls[0].Database -ceq 'postgres' -and $script:FreshCalls[0].Sql -ceq ('CREATE DATABASE "'+$freshClone+'" WITH TEMPLATE "'+$freshSource+'";')) 'Fresh clone did not use the verified six-product source.'
 Rejects {Assert-Clone $freshSource};Rejects {Assert-Clone 'restore_3dkid_batch18'}
 Rejects {New-PgProcessInfo $freshSource 'C:\safe.sql' $false}
 $script:Baseline='neondb';Rejects {Get-CloneStatement $freshClone}
}finally{$script:Baseline=$savedBaseline;${function:Invoke-PgSql}=$savedInvoke}
Check ($source.Contains("Checks.Insert(6,'SixProducts','NOT_RUN')") -and $source.Contains("'FRESH_REFERENCE_DATA_DIFFERS'")) 'Six-product evidence/gate binding absent.'
$after.categories='unchanged';$after.records.ProductOptionValue='changed-price-same-count'
Rejects {Assert-DataPreserved $before $after}
Check ($source -match "'records',\(SELECT jsonb_object_agg" -and $source.Contains("to_jsonb(t)-'retiredAt'") -and $source.Contains("to_jsonb(t)-'productVariantId'")) 'All-table legacy projection missing.'
$profileBlock=@($ast.EndBlock.Statements|Where-Object {$_ -is [Management.Automation.Language.IfStatementAst] -and $_.Extent.Text.Contains("Checks.Insert(6,'SixProducts'")})
Check ($profileBlock.Count -eq 1) 'Fresh gate initialization not found.'
$savedReport=$script:Report;$FreshProductionRestore=$true
try{
 $script:Report=[ordered]@{Checks=[ordered]@{ServerIdentity='NOT_RUN';Baseline='NOT_RUN';FreshClones='NOT_RUN';CandidateGuards='NOT_RUN';Migration='NOT_RUN';SchemaIntegrity='NOT_RUN';FiveProducts='NOT_RUN';LegacyHistory='NOT_RUN';NativeIntegrity='NOT_RUN';DeferredFailure='NOT_RUN';MigrationRollback='NOT_RUN';SourceUnchanged='NOT_RUN'}}
 . ([scriptblock]::Create($profileBlock[0].Extent.Text))
 Check ($script:Report.Checks.Count -eq 12 -and $script:Report.Checks.Contains('SixProducts') -and -not $script:Report.Checks.Contains('FiveProducts')) 'Fresh profile lost or duplicated a gate.'
}finally{$script:Report=$savedReport}
Pass 'Fresh six-product profile: mocked clone selection, both references protected, exact 12 gates, immutable restore-evidence binding and all-table price/history digest preservation.'
Write-Output ("PASS operator offline checks: $passed groups. Migration/SQL execution NOT RUN; wait for operator results.")
