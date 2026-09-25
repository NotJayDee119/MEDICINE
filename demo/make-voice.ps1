# Generates the voice-over clips for SCRIPT.md with the built-in Windows voices.
# Run:  powershell -ExecutionPolicy Bypass -File make-voice.ps1 [-Voice Zira]
param([string]$Voice = 'David', [int]$Rate = 0)

Add-Type -AssemblyName System.Speech

$scenes = [ordered]@{
  '01-intro'    = "Hi, this is MediShop, a pharmacy shopping app built with React Native and Expo. It connects to two APIs: my own P H P and My S Q L REST API hosted on Freehostia, and the public disease dot S H COVID-19 API."
  '02-external' = "First, the third-party API. The Health Watch card on the Today page makes two live GET requests to disease dot S H for the Philippines. It parses the JSON and shows active cases, the recovery rate, total cases and vaccine doses, with when the data was last updated. Pulling down fetches it again."
  '03-read'     = "Now my own API. Read: the Shop tab calls GET medicines dot P H P and shows every product in a grid, with photos, prices and stock. I can filter by aisle, and tapping a product opens its detail screen. Search filters the same list as I type."
  '04-create'   = "Create: products are managed from the admin website, which uses the same API. If I try to save an empty form, validation stops me and marks each field. I'll add Vitamin C, five hundred milligrams, at twelve pesos with fifty in stock. That sends a POST request. Back on the phone, one refresh and the new product is on the shelf."
  '05-update'   = "Update: Edit opens the form already filled in with the saved record. I'll change the price to fifteen and the stock to forty. This sends a PUT request, and the app shows the new price right away."
  '06-delete'   = "Delete: removing a product asks for confirmation first, because it can't be undone. After I confirm, a DELETE request removes the row from the database, and it disappears from the app."
  '07-order'    = "The app also creates records itself. I'll add two items and check out. The form is validated here too. Placing the order POSTs to orders dot P H P, which saves it and lowers the stock in one transaction, and I get a receipt. When the admin marks it ready, opening the receipt on the phone fetches the new status."
  '08-outro'    = "The full code, the P H P backend and the third-party API URL are all in the GitHub repository. Thank you for watching."
}

$out = Join-Path $PSScriptRoot 'voice'
New-Item -ItemType Directory -Force $out | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft $Voice Desktop")
$synth.Rate = $Rate

foreach ($name in $scenes.Keys) {
  $synth.SetOutputToWaveFile((Join-Path $out "$name.wav"))
  $synth.Speak($scenes[$name])
}

# One continuous track too, with a short pause between scenes.
$synth.SetOutputToWaveFile((Join-Path $out 'full-voiceover.wav'))
$prompt = New-Object System.Speech.Synthesis.PromptBuilder
foreach ($name in $scenes.Keys) {
  $prompt.AppendText($scenes[$name])
  $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1200))
}
$synth.Speak($prompt)

$synth.SetOutputToNull()
$synth.Dispose()
Write-Output "Saved to $out"
