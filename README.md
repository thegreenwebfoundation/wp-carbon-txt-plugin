# WP Carbon.txt

A user-friendly WordPress plugin to publish a
[`carbon.txt`](https://carbontxt.org) file with your organisation's
sustainability disclosures.

`carbon.txt` is a single, recognisable location on any web domain
(`https://your-site.com/carbon.txt`) for public, machine-readable
sustainability data relating to that organisation.

## Features

- Declare one or more **organisational disclosures**, each with a document
  type and a URL.
- Point a disclosure at a URL in three ways:
  - Paste any URL directly.
  - Pick an existing **published page** with a searchable autocomplete.
  - Choose a **file from the media library** — the picker shows every
    file, so use its built-in search to find the one you want.

  Whichever you pick, revisiting a disclosure later reopens it the same
  way — it remembers the selected page or file, not just the resulting URL.
- Optional **title**, **valid-until** date, and **domain** (for
  organisations publishing disclosures that apply to more than one domain)
  per disclosure.
- **Live preview** of the exact `carbon.txt` that will be served.
- Detects a **carbon.txt file already on your server**, at either the
  domain root or the well-known location (e.g. created with the
  [carbontxt.org builder](https://carbontxt.org/tools/builder) and
  uploaded manually), warns that your web server may still serve that file
  directly regardless of these settings, and offers to:
  - **Import** any disclosures it can parse out of that file.
  - **Permanently delete** it once its disclosures have been imported and
    your settings here have been saved, so this plugin's own output is
    what gets served.
- **Keep a copy** of your disclosures — copy to clipboard or download as a
  file — since removing the plugin also removes its saved settings.
  Offered proactively when you deactivate it from the Plugins screen, and
  always available from a collapsed section on the settings screen.
- Add your **Green Web Foundation API key** in Settings — the first step
  toward validating your carbon.txt against their hosted validator, coming
  in an upcoming release.
- Detects a **DNS-based delegation record** (a `carbon-txt-location` TXT
  record, per [carbontxt.org/faq](https://carbontxt.org/faq)) on your
  domain, and warns that it takes priority over any file this plugin
  generates.
- The file is generated on request from your saved settings and cached, so
  there is no physical file to manage and it survives deploys.
- Served at the site root even with plain permalinks.

Built with modern, native WordPress tooling: the settings screen is a
React app using `@wordpress/components`, the setting is stored through the
core REST settings endpoint (no custom REST controller for that part), and
the file picker uses the classic `wp.media()` frame rather than pulling in
`@wordpress/block-editor` as a dependency.

The output follows the [carbon.txt v0.5 syntax](https://carbontxt.org/syntax).

## Installation

**From a release:** download the plugin zip, then upload it via
**Plugins → Add New → Upload Plugin** in wp-admin.

**From source:** clone the repository into `wp-content/plugins/`, then build
the admin app (the compiled `build/` directory is not committed):

```sh
npm install
npm run build
```

Activate **WP Carbon.txt**, then go to **Settings → Carbon.txt** to add your
disclosures.

## Development

Requirements: Node.js and PHP with [Composer](https://getcomposer.org/).

```sh
npm install            # JS dependencies
composer install       # PHP dev tooling (PHPCS / WPCS)

npm run start          # rebuild the admin app on change
npm run build          # production build

npm run lint:js        # lint JavaScript
composer run lint      # lint PHP against WordPress standards
composer run lint:fix  # auto-fix PHP where possible
```

### Translations

Source strings live in PHP and `src/index.js`. To regenerate the catalog and
compile a locale (Spanish shown):

```sh
wp i18n make-pot . languages/wp-carbon-txt-plugin.pot --exclude=build,node_modules,vendor
wp i18n make-mo languages/wp-carbon-txt-plugin-es_ES.po languages/
wp i18n make-json languages/wp-carbon-txt-plugin-es_ES.po --no-purge
```

The JavaScript catalog is named after the script handle
(`wp-carbon-txt-plugin-es_ES-wp-carbon-txt-admin.json`) so WordPress loads it
without depending on a source-path hash.

## Contributing

This plugin is developed in the open and contributions are welcome. Please
open an issue or pull request on
[GitHub](https://github.com/thegreenwebfoundation/wp-carbon-txt-plugin). Run
the linters above before submitting.

## License

[GPL-2.0-or-later](LICENSE).
