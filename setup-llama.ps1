# setup-llama.ps1
param(
    [string]$ModelName = "phi-2.q4_0.gguf"
)

Write-Host "🔧 Configuration de Llama.cpp..." -ForegroundColor Green

$LlamaDir = "llama.cpp"
$ModelUrl = "https://huggingface.co/TheBloke/phi-2-GGUF/resolve/main/phi-2.q4_0.gguf"

# Vérifier si llama.cpp existe
if (-not (Test-Path $LlamaDir)) {
    Write-Host "❌ Dossier $LlamaDir introuvable" -ForegroundColor Red
    Write-Host "💡 Téléchargez llama.cpp depuis: https://github.com/ggerganov/llama.cpp" -ForegroundColor Yellow
    exit 1
}

# Vérifier le modèle
if (Test-Path "$LlamaDir\$ModelName") {
    Write-Host "✅ Modèle déjà présent: $ModelName" -ForegroundColor Green
} else {
    Write-Host "📥 Téléchargement du modèle Phi-2..." -ForegroundColor Yellow
    
    try {
        # Téléchargement avec barre de progression
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $ModelUrl -OutFile "$LlamaDir\$ModelName"
        
        Write-Host "✅ Modèle téléchargé avec succès!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Erreur lors du téléchargement: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Téléchargez manuellement depuis: https://huggingface.co/TheBloke/phi-2-GGUF" -ForegroundColor Yellow
        exit 1
    }
}

# Vérifier la taille
$fileInfo = Get-Item "$LlamaDir\$ModelName"
$fileSizeGB = [math]::Round($fileInfo.Length / 1GB, 2)
Write-Host "📊 Taille du modèle: $fileSizeGB GB" -ForegroundColor Cyan

Write-Host "`n🎯 Setup terminé! Utilisez 'start-geopol.bat' pour lancer l'application." -ForegroundColor Green