<img src="data/icons/re.sonny.Eloquent.svg" width="120" height="120" align="left" alt="Eloquent logo">

# Eloquent Local Assistant

**Private and fully local proofreading for Firefox**

<br clear="left">

Eloquent Local Assistant is a complete cross-platform proofreading solution powered by [LanguageTool](https://languagetool.org/).

It combines a desktop companion with a dedicated Firefox extension. The companion runs LanguageTool locally, while the extension provides spelling and grammar corrections directly inside text fields, rich-text editors and supported websites.

Your text remains on your computer: no account, cloud service or remote proofreading API is required.

## Components

| Component                                | Purpose                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| **Eloquent Local Companion**             | Starts and manages the bundled Java and LanguageTool server                       |
| **Eloquent Local Assistant for Firefox** | Displays underlines, explanations and replacement suggestions directly in Firefox |
| **LanguageTool standalone server**       | Performs spelling, grammar and style analysis locally                             |

The companion exposes LanguageTool only through the local endpoint:

```text
http://127.0.0.1:8082/v2
```

The Firefox extension refuses connections to non-local servers.

## Downloads

### Desktop companion 0.2.0

[Download Eloquent Local Companion 0.2.0](https://github.com/Othman-Benbrahim/Eloquent/releases/tag/companion-v0.2.0)

Available for:

* Windows;
* macOS Intel;
* macOS Apple Silicon;
* Linux as a Flatpak package.

### Firefox extension 0.1.8

[Download the signed Firefox extension](https://github.com/Othman-Benbrahim/Eloquent/releases/tag/firefox-v0.1.8)

The signed `.xpi` file can be installed in standard versions of Firefox.

## Installation

1. Download the appropriate Eloquent Local Companion package for your operating system.
2. Install and start the companion.
3. Make sure the local LanguageTool server is running on port `8082`.
4. Download the signed Firefox `.xpi` file.
5. Open the `.xpi` file with Firefox and confirm the installation.
6. Start typing in a supported field.

The extension uses the correct local endpoint by default, so no additional configuration should normally be required.

> Windows SmartScreen or macOS Gatekeeper may display a warning because the current companion packages are not yet digitally signed or notarized.

## Features

* Local grammar, spelling and style checking;
* clickable underlines and correction suggestions;
* one-click replacements;
* support for `input`, `textarea` and `contenteditable` fields;
* support for rich-text editors, iframes and Shadow DOM components;
* compatibility with dynamically created editors;
* transaction-based replacements for JavaScript-controlled editors;
* protection against duplicated words when applying corrections on Facebook;
* automatic language detection;
* normal and thorough proofreading levels;
* per-domain activation settings;
* local contextual French proofreading;
* no account, telemetry or remote text processing.

The extension currently supports:

* French;
* English;
* German;
* Spanish;
* Italian;
* Portuguese.

## Privacy

Eloquent Local Assistant is designed to keep proofreading private.

* Text is sent only to the LanguageTool server running on your computer.
* Only loopback addresses such as `localhost`, `127.0.0.1` and `::1` are accepted.
* No text is transmitted to the project maintainers.
* No analytics or telemetry are included.
* No user account is required.
* The software continues to work without an Internet connection after installation.

See the complete [privacy policy](firefox-addon/PRIVACY.md).

## Known limitations

* LinkedIn comments are supported.
* LinkedIn’s new-post composer is not detected reliably yet.
* Firefox does not allow extensions to access certain protected browser pages and internal fields.
* Compatibility may vary with websites that frequently replace or redesign their text editors.

The LinkedIn publication editor will be investigated in a future version using diagnostics targeted at the editor structure loaded for authenticated users.

## Development

The Firefox project is located in `firefox-addon/`.

### Run the Firefox tests on Windows

```powershell
cd firefox-addon
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\Test-Firefox.ps1
```

### Build the Firefox packages

```powershell
cd firefox-addon
.\scripts\Build-Firefox.ps1
```

The build generates:

* an unsigned development XPI;
* a source ZIP for Mozilla Add-ons review.

The installable XPI distributed in the GitHub release is signed by Mozilla.

### Project structure

```text
firefox-addon/
├── extension/     Firefox extension source code
├── companion/     Cross-platform desktop companion
├── tests/         Automated tests
├── scripts/       Validation, build and publishing scripts
└── docs/          Architecture, roadmap and test documentation
```

See the [architecture documentation](firefox-addon/docs/ARCHITECTURE.md) for more information.

## Project history

This project is based on [Eloquent](https://github.com/sonnyp/Eloquent), the offline proofreading application originally created by [Sonny Piers](https://github.com/sonnyp).

This fork extends the original project with:

* a dedicated Firefox extension;
* a cross-platform local companion;
* bundled Java and LanguageTool resources;
* Windows and macOS support;
* local browser integration;
* automated Firefox, companion and packaging tests.

## Copyright

Original Eloquent application:

© 2025 [Sonny Piers](https://github.com/sonnyp)

Eloquent Local Assistant, Firefox integration and companion additions:

© 2026 [Othman Benbrahim](https://github.com/Othman-Benbrahim) and contributors

## License

Eloquent Local Assistant is free software distributed under the GNU General Public License version 3.

See the [COPYING](COPYING) file for the complete license.
