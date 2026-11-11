# Run locally in an interactive PowerShell terminal. Never edits .env or writes credentials to disk.
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
    $adminLogin = Read-Host 'New admin login'
    if ([string]::IsNullOrWhiteSpace($adminLogin) -or $adminLogin -match '[\r\n"\x00]') { throw 'Use a nonempty login without quotes or control characters.' }
    $securePassword = Read-Host 'New admin password (12+ characters, at most 72 UTF-8 bytes)' -AsSecureString
    $secureConfirmation = Read-Host 'Repeat new password' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConfirmation)
    try {
        $passwordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        $confirmationValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
        if ($passwordValue -cne $confirmationValue) { throw 'Passwords do not match.' }
        if ($passwordValue.Length -lt 12 -or [Text.Encoding]::UTF8.GetByteCount($passwordValue) -gt 72) { throw 'Password must have 12+ characters and at most 72 UTF-8 bytes.' }
        # stdin, never a process argument, environment variable, transcript line, or repository file.
        $credentialInput = @{ username = $adminLogin.Trim(); password = $passwordValue } | ConvertTo-Json -Compress
        $previousInputEncoding = $OutputEncoding
        try {
            $OutputEncoding = [Text.UTF8Encoding]::new($false)
            $preparedConfiguration = $credentialInput | node scripts/prepare-admin-credentials.mjs
            if ($LASTEXITCODE -ne 0) { throw 'Credential preparation failed.' }
        } finally { $OutputEncoding = $previousInputEncoding }
        # Copy only on the user's local machine. No hash/secret is printed or written to a file.
        Set-Clipboard -Value ($preparedConfiguration -join [Environment]::NewLine)
        Write-Host 'Prepared env lines are on your clipboard. Paste them into your local .env manually, replacing old lines. Remove ADMIN_TOTP_SECRET and restart the app.'
        Write-Host 'After pasting, clear the clipboard with: Set-Clipboard -Value ""'
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer)
        $passwordValue = $null; $confirmationValue = $null; $credentialInput = $null; $preparedConfiguration = $null
        $securePassword.Dispose(); $secureConfirmation.Dispose()
    }
} finally { Pop-Location }
