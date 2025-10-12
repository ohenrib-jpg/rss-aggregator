[Setup]
AppName=RSS Aggregator
AppVersion=1.0
DefaultDirName={autopf}\RSSAggregator
DefaultGroupName=RSS Aggregator
OutputBaseFilename=RSS_Aggregator_Setup
Compression=lzma
SolidCompression=yes

[Files]
Source: "\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{group}\RSS Aggregator"; Filename: "{app}\launch.bat"
Name: "{userdesktop}\RSS Aggregator"; Filename: "{app}\launch.bat"

[Code]
var
  ModePage: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  ModePage := CreateInputOptionPage(
    wpSelectDir,
    'Mode d''installation',
    'Choisissez le mode de fonctionnement de RSS Aggregator',
    'Sélectionnez le mode :',
    True, False
  );
  ModePage.Add('Mode Local (héberge le serveur Flask/Node)');
  ModePage.Add('Mode Connecté (Render)');
  ModePage.Values[0] := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  SettingsFile: String;
  Content: String;
begin
  if CurStep = ssPostInstall then
  begin
    SettingsFile := ExpandConstant('{app}\Settings.ini');
    if ModePage.Values[0] then
      Content := '[General]'#13#10'mode=local'#13#10'remote_url=https://rss-aggregator-l7qj.onrender.com'
    else
      Content := '[General]'#13#10'mode=remote'#13#10'remote_url=https://rss-aggregator-l7qj.onrender.com';
    SaveStringToFile(SettingsFile, Content, False);
  end;
end;

