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
- Point a disclosure at any URL, or pick an existing **published page** with
  a searchable autocomplete.
- Optional **title** and **valid-until** date per disclosure.
- **Live preview** of the exact `carbon.txt` that will be served.
- The file is generated on request from your saved settings and cached, so
  there is no physical file to manage and it survives deploys.
- Served at the site root even with plain permalinks.

Built with modern, native WordPress tooling: the settings screen is a
React app using `@wordpress/components`, and the setting is stored through
the core REST settings endpoint — no custom REST controller.

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
[Codeberg](https://codeberg.org/nahuai/wp-carbon-txt-plugin). Run the linters
above before submitting.

## License

[GPL-2.0-or-later](LICENSE).
