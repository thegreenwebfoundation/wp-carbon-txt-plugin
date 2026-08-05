=== WP Carbon.txt ===
Contributors: nahuai
Tags: carbon.txt, sustainability, emissions, carbon, green web
Requires at least: 6.6
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Publish a carbon.txt file with your organisational sustainability disclosures.

== Description ==

WP Carbon.txt lets you publish a carbon.txt file at your site root
(https://your-site.com/carbon.txt) following the carbon.txt v0.5 syntax.

You can declare one or more organisational disclosures. For each one,
choose a document type and point to it by pasting a URL, selecting an
existing published page, or choosing a file from your media library —
plus an optional title and valid-until date. A live preview shows the
exact file that will be served.

If a carbon.txt file already exists on your server, the settings screen
warns you about it, offers to import any disclosures found in it, and
lets you rename it aside (kept as a backup, never deleted) once your
settings here have been saved.

The file is generated on request from your saved settings and cached, so
there is no physical file to manage and it survives deploys.

== Development ==

Source lives in `src/`. Build the admin app with:

`npm install && npm run build`

== Changelog ==

= 0.2.0 =
* Add a media library file picker as a third way to point a disclosure at a URL, alongside pasting one or selecting a page.
* Remember the selected page or file by ID, so revisiting a disclosure shows the same selection instead of falling back to a plain URL.
* Detect a carbon.txt file already on the server, warn that the web server may keep serving it directly, and offer to import disclosures found in it.
* Offer to rename an existing file aside as a dated backup (never deleted) once settings have been saved.

= 0.1.0 =
* Multiple organisational disclosures, each with a document type, a URL or page, and an optional title and valid-until date.
* Live preview and /carbon.txt endpoint.
* Add a Settings link on the Plugins screen and redirect to the settings page after activating the plugin on its own.
