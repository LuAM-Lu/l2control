<#
.SYNOPSIS
  L2 Control: la PC del local baja los respaldos del servidor (B7-4, M-26).

.DESCRIPTION
  Cada noche el servidor deja un respaldo cifrado de la base. Esta PC lo baja, comprueba su huella,
  le confirma al servidor que ya lo tiene y guarda una escalera: los ultimos 30 dias, una copia por
  semana (las ultimas 12) y una por mes (todas). Sin la clave privada del local un respaldo no se
  puede abrir: aqui solo se guardan.

  Preparar esta PC (una vez, sin permisos de administrador): Ajustes > Respaldos da la orden exacta
  para pegar en PowerShell. Pide la credencial que da el panel y deja una tarea programada que
  corre cada dia a las 7:00 am, al entrar en Windows y, si a esa hora estaba apagada, en cuanto se pueda.

  Una pasada a mano:  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\L2Control\l2-respaldos.ps1"
  Quitar la tarea:    ... -File "$env:LOCALAPPDATA\L2Control\l2-respaldos.ps1" -Quitar
#>
param(
  [switch]$Instalar,
  [switch]$Quitar,
  [string]$Servidor,
  [string]$Carpeta
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Casa = Join-Path $env:LOCALAPPDATA 'L2Control'
$Ajustes = Join-Path $Casa 'respaldos.json'
$ArchivoCredencial = Join-Path $Casa 'respaldos.credencial'
$Programa = Join-Path $Casa 'l2-respaldos.ps1'
$Tarea = 'L2 Control - Respaldos'
# Cuantos se guardan (ojo: en PowerShell $Diarios y $diarios son la misma variable).
$GuardarDiarios = 30
$GuardarSemanales = 12
$script:Registro = $null

function Decir([string]$texto) {
  $linea = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto
  Write-Host $linea
  if ($script:Registro) { Add-Content -Path $script:Registro -Value $linea -Encoding UTF8 }
}

function Huella([string]$archivo) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $archivo).Hash.ToLowerInvariant()
}

# La credencial se guarda cifrada para este usuario de Windows (DPAPI): otro usuario, u otra PC, no la lee.
function LeerCredencial {
  # Set-Content le pone un salto de linea al final, y ConvertTo-SecureString no lo acepta.
  $segura = (Get-Content -LiteralPath $ArchivoCredencial -Raw).Trim() | ConvertTo-SecureString
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

function FechaDe([string]$nombre) {
  # l2control-20261008T071500Z.l2r
  [datetime]::ParseExact($nombre.Substring(10, 15), 'yyyyMMdd\THHmmss', [Globalization.CultureInfo]::InvariantCulture)
}

function SemanaDe([string]$nombre) {
  $d = FechaDe $nombre
  '{0}-{1:00}' -f $d.Year, [Globalization.CultureInfo]::InvariantCulture.Calendar.GetWeekOfYear($d, 'FirstFourDayWeek', 'Monday')
}
function MesDe([string]$nombre) { (FechaDe $nombre).ToString('yyyy-MM') }

# En una carpeta de la escalera queda uno por grupo (semana o mes): el mas nuevo. El de la semana o el mes en curso se
# renueva cada dia hasta que el grupo se cierra.
function UnoPorGrupo([string]$desde, [string]$carpeta, [scriptblock]$grupo) {
  foreach ($g in (Get-ChildItem -LiteralPath $desde -Filter 'l2control-*.l2r' | Group-Object { & $grupo $_.Name })) {
    $nuevo = $g.Group | Sort-Object Name -Descending | Select-Object -First 1
    if (-not (Test-Path -LiteralPath (Join-Path $carpeta $nuevo.Name))) { Copy-Item -LiteralPath $nuevo.FullName -Destination $carpeta }
  }
  foreach ($g in (Get-ChildItem -LiteralPath $carpeta -Filter 'l2control-*.l2r' | Group-Object { & $grupo $_.Name })) {
    $g.Group | Sort-Object Name -Descending | Select-Object -Skip 1 | Remove-Item -Force
  }
}

# La escalera: los ultimos 30 dias en diarios, el mas nuevo de cada semana (las ultimas 12) y el de cada mes (todos).
function Escalera([string]$base) {
  $diarios = Join-Path $base 'diarios'
  $semanales = Join-Path $base 'semanales'
  $mensuales = Join-Path $base 'mensuales'
  New-Item -ItemType Directory -Force -Path $semanales, $mensuales | Out-Null
  UnoPorGrupo $diarios $semanales ${function:SemanaDe}
  UnoPorGrupo $diarios $mensuales ${function:MesDe}
  Get-ChildItem -LiteralPath $diarios -Filter 'l2control-*.l2r' | Sort-Object Name -Descending | Select-Object -Skip $GuardarDiarios | Remove-Item -Force
  Get-ChildItem -LiteralPath $semanales -Filter 'l2control-*.l2r' | Sort-Object Name -Descending | Select-Object -Skip $GuardarSemanales | Remove-Item -Force
}

function Pasada {
  $a = Get-Content -LiteralPath $Ajustes -Raw | ConvertFrom-Json
  $script:Registro = Join-Path $a.carpeta 'registro.txt'
  $diarios = Join-Path $a.carpeta 'diarios'
  New-Item -ItemType Directory -Force -Path $diarios | Out-Null
  $h = @{ Authorization = 'Bearer ' + (LeerCredencial) }
  try {
    $indice = Invoke-RestMethod -Uri "$($a.servidor)/respaldos/indice" -Headers $h -TimeoutSec 60
  } catch {
    $codigo = $null
    if ($_.Exception.PSObject.Properties['Response'] -and $_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
    if ($codigo -eq 401) { Decir 'La credencial ya no vale: prepara esta PC otra vez desde Ajustes > Respaldos.' }
    elseif ($codigo -eq 404) { Decir 'Ese servidor no sirve respaldos todavia.' }
    else { Decir "No se pudo hablar con $($a.servidor): $($_.Exception.Message)" }
    exit 1
  }
  $nuevos = 0
  $errores = 0
  foreach ($c in @($indice.copias)) {
    $destino = Join-Path $diarios $c.archivo
    $tiene = (Test-Path -LiteralPath $destino) -and ((Huella $destino) -eq $c.sha256)
    if (-not $tiene) {
      $parcial = "$destino.parcial"
      try {
        Invoke-WebRequest -Uri "$($a.servidor)/respaldos/archivo/$($c.archivo)" -Headers $h -OutFile $parcial -UseBasicParsing -TimeoutSec 3600
      } catch {
        Decir "No se pudo bajar $($c.archivo): $($_.Exception.Message)"
        $errores++
        continue
      }
      if ((Huella $parcial) -ne $c.sha256) {
        Remove-Item -LiteralPath $parcial -Force
        Decir "$($c.archivo) llego con otra huella: no se guarda; se intenta otra vez en la proxima pasada."
        $errores++
        continue
      }
      Move-Item -LiteralPath $parcial -Destination $destino -Force
      $nuevos++
    }
    # Se confirma cada vez: el servidor dice si ya lo sabia, y asi un acuse que se perdio se repite solo.
    $cuerpo = @{ archivo = $c.archivo; sha256 = $c.sha256 } | ConvertTo-Json -Compress
    try {
      Invoke-RestMethod -Method Post -Uri "$($a.servidor)/respaldos/acuse" -Headers $h -ContentType 'application/json' -Body $cuerpo -TimeoutSec 60 | Out-Null
    } catch {
      Decir "El servidor no tomo el acuse de $($c.archivo): $($_.Exception.Message)"
      $errores++
    }
  }
  Escalera $a.carpeta
  $total = @(Get-ChildItem -LiteralPath $diarios -Filter 'l2control-*.l2r').Count
  Decir ("Pasada hecha: {0} nuevo(s), {1} en diarios, {2} error(es). Carpeta: {3}" -f $nuevos, $total, $errores, $a.carpeta)
  # Que el registro no crezca sin fin.
  $lineas = @(Get-Content -LiteralPath $script:Registro -Encoding UTF8)
  if ($lineas.Count -gt 1000) { $lineas | Select-Object -Last 500 | Set-Content -LiteralPath $script:Registro -Encoding UTF8 }
  if ($errores -gt 0) { exit 1 }
}

function Instalar {
  if (-not $Servidor) { $Servidor = Read-Host 'Direccion del servidor (como https://217-216-48-54.sslip.io)' }
  $Servidor = $Servidor.TrimEnd('/')
  if ($Servidor -notmatch '^https://') { throw 'La direccion del servidor empieza por https://' }
  if (-not $Carpeta) { $Carpeta = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'L2 Control - Respaldos' }
  # Sin nadie delante (una instalacion a distancia), de la variable L2_RESPALDOS_CREDENCIAL: no queda en el historial.
  if ($env:L2_RESPALDOS_CREDENCIAL) {
    $texto = $env:L2_RESPALDOS_CREDENCIAL.Trim()
  } else {
    $segura = Read-Host 'Credencial que dio Ajustes > Respaldos (no se ve al escribirla)' -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try { $texto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
  }
  if ($texto -notmatch '^[0-9a-f]{64}$') { throw 'La credencial son 64 letras y numeros (0-9 y a-f). Copiala otra vez del panel.' }

  New-Item -ItemType Directory -Force -Path $Casa, $Carpeta | Out-Null
  ConvertTo-SecureString $texto -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $ArchivoCredencial
  @{ servidor = $Servidor; carpeta = $Carpeta } | ConvertTo-Json | Set-Content -LiteralPath $Ajustes -Encoding UTF8
  if ($PSCommandPath -ne $Programa) { Copy-Item -LiteralPath $PSCommandPath -Destination $Programa -Force }

  $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Programa`""
  $cadaDia = New-ScheduledTaskTrigger -Daily -At '7:00am'
  $alEntrar = New-ScheduledTaskTrigger -AtLogOn -User ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME)
  $reglas = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $cadaDia, $alEntrar -Settings $reglas -Force `
    -Description 'L2 Control: baja los respaldos cifrados del servidor y guarda la escalera (Ajustes > Respaldos).' | Out-Null
  Write-Host "Lista. La tarea '$Tarea' corre cada dia a las 7:00 am y al entrar en Windows. Primera pasada:"
  Pasada
}

if ($Quitar) {
  Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ArchivoCredencial -Force -ErrorAction SilentlyContinue
  Write-Host "Tarea quitada y credencial borrada. Los respaldos ya bajados siguen en su carpeta."
} elseif ($Instalar) {
  Instalar
} else {
  if (-not (Test-Path -LiteralPath $Ajustes)) { Write-Host 'Esta PC no esta preparada: usa la orden de Ajustes > Respaldos.'; exit 1 }
  Pasada
}
