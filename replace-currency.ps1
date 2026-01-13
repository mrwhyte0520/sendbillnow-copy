$paths = @(
    "c:\Users\fitzr\Downloads\contabi v9 (2)\Sendbillnow\src",
    "c:\Users\fitzr\Downloads\contabi v9 (2)\Sendbillnow\supabase"
)

foreach ($path in $paths) {
    Get-ChildItem -Path $path -Recurse -Include *.ts,*.tsx,*.js,*.jsx,*.md,*.json,*.sql -File | ForEach-Object {
        $content = Get-Content -Path $_.FullName -Raw
        $updated = $content -replace 'RD\$', '$'
        if ($updated -ne $content) {
            Set-Content -Path $_.FullName -Value $updated -NoNewline
        }
    }
}
