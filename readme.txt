=== WP Carbon.txt ===
Contributors: nahuai
Tags: carbon.txt, sustainability, emissions, carbon, green web
Requires at least: 6.6
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Publish a carbon.txt file with your organisational sustainability disclosures.

== Description ==

WP Carbon.txt lets you publish a carbon.txt file at your site root
(https://your-site.com/carbon.txt) following the carbon.txt v0.5 syntax.

You can declare one or more organisational disclosures. For each one,
choose a document type and point to it either by pasting a URL or by
selecting an existing published page, plus an optional title and
valid-until date. A live preview shows the exact file that will be served.

The file is generated on request from your saved settings and cached, so
there is no physical file to manage and it survives deploys.

== Development ==

Source lives in `src/`. Build the admin app with:

`npm install && npm run build`

== Changelog ==

= 0.1.0 =
* Multiple organisational disclosures, each with a document type, a URL or page, and an optional title and valid-until date.
* Live preview and /carbon.txt endpoint.
