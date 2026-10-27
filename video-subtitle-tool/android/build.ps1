param([string]$Gradle = '')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$sdkDir = $env:ANDROID_HOME
if (!$sdkDir) { $sdkDir = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$jdkDir = $env:JAVA_HOME
if (!$jdkDir) { $jdkDir = Join-Path $env:LOCALAPPDATA 'Android\jdk21' }
if (!(Test-Path (Join-Path $jdkDir 'bin\java.exe'))) { throw 'Set JAVA_HOME to JDK 17 or 21.' }
if (!(Test-Path $sdkDir)) { throw 'Set ANDROID_HOME to your Android SDK.' }
$env:JAVA_HOME = $jdkDir
$tmpDir = Join-Path $PSScriptRoot '.tmp'
New-Item -ItemType Directory -Force $tmpDir | Out-Null
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir="' + $tmpDir + '" -Djava.io.tmpdir="' + $tmpDir + '"'
$sdkProperty = $sdkDir.Replace('\','/').Replace(':','\:')
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'local.properties') -Value ('sdk.dir=' + $sdkProperty)
$keysDir = Join-Path $projectDir '.keys'
New-Item -ItemType Directory -Force $keysDir | Out-Null
$keyFile = Join-Path $keysDir 'personal.jks'
if (!(Test-Path $keyFile)) {
    & (Join-Path $jdkDir 'bin\keytool.exe') -genkeypair -keystore $keyFile -storepass android -alias personal -keypass android -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Personal Video Subtitle'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot generate signing key.' }
}
if (!$Gradle) { $Gradle = Join-Path $PSScriptRoot 'gradlew.bat' }
& $Gradle -p $PSScriptRoot assembleRelease testDebugUnitTest lintRelease --no-daemon --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Build/test failed; no APK copied.' }
$distDir = Join-Path $projectDir 'dist'
New-Item -ItemType Directory -Force $distDir | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app\build\outputs\apk\release\app-release.apk') -Destination (Join-Path $distDir 'video-subtitle-personal.apk')
Get-FileHash -LiteralPath (Join-Path $distDir 'video-subtitle-personal.apk') -Algorithm SHA256
