=== Carbon.txt ===
Contributors: nahuai, greenwebfoundation, timcowlishaw, hanopcan
Tags: carbon.txt, sustainability, emissions, carbon, green web
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.5
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Publish a carbon.txt file with your organisational sustainability disclosures.

== Description ==

Carbon.txt lets you publish a carbon.txt file at your site root
(https://your-site.com/carbon.txt) following the carbon.txt v0.6 syntax.

You can declare one or more organisational disclosures. For each one,
choose a document type and point to it by pasting a URL, selecting an
existing published page, or choosing a file from your media library —
plus an optional title, description, valid-until date, and domain (for
disclosures that apply to more than one domain), and references to the
certification schemes you hold. A live preview shows the exact file
that will be served.

The document type picker offers the types the carbon.txt syntax defines.
The "web page" type is deprecated by the Green Web Foundation, so it is no
longer offered and new disclosures start at "sustainability page" —
disclosures that already use "web page" keep working and are labelled as
deprecated in the editor.

Entries still missing a required field are skipped when you save: a
disclosure needs a URL, and a certification needs a title and a URL. The
editor marks every field as required or optional, and tells you what was
skipped after each save.

At the org level you can also list the certification schemes your
organisation holds — each with a title, a URL, and an optional
description, with ids generated for you. Every save re-stamps the
org-level last_updated date.

If a carbon.txt file already exists on your server — at the domain root or
the well-known location — the settings screen warns you about it and
offers to import any disclosures found in it. Once imported and saved,
the old file is permanently deleted so this plugin's own output is what
gets served.

Removing the plugin also removes its saved settings, so it offers to copy
or download your disclosures before you deactivate it — and a "Keep a
copy" section is always available, collapsed, on the settings screen.

Every save asks the Green Web Foundation's hosted validator to validate
your domain — no key or setup required. Their validator fetches your live
carbon.txt from the web, so this needs a publicly reachable site — local
and staging domains are skipped — and a passing domain is registered in
your Green Web Foundation dashboard. Validation can be turned off per site
from a toggle on the settings screen. See "External validation" below for
exactly what is sent.

The settings screen also checks your domain for a `carbon-txt-location`
DNS TXT record (see https://carbontxt.org/faq). If one is set, it takes
priority over any file this plugin generates, so you're warned about it
rather than left wondering why your settings don't seem to take effect.

The file is generated on request from your saved settings and cached, so
there is no physical file to manage and it survives deploys.

== External validation ==

When saving changes to your carbon.txt file, if the "Validate with Green
Web Foundation after saving" option is checked, the plugin submits the
fully-qualified domain name of your WordPress site to the carbon.txt
validator API (https://carbon-txt-api.greenweb.org/), operated by The Green
Web Foundation, on save.

We do this for two reasons. First, by ensuring the external validator can
read and parse your carbon.txt file, we make sure it is visible to anyone
who might want to access it, and that no firewall, CAPTCHA or CDN prevents
access to it. Secondly, it allows us to monitor aggregate usage of the
plugin and the carbon.txt standard, for future improvements, and to track
our progress in making the web fossil-fuel free. Only your domain name is
sent as part of this process, and no personally identifying information is
transmitted or retained.

If you want to opt out, uncheck the validation checkbox before saving.

== Development ==

Source lives in `src/`. Build the admin app with:

`npm install && npm run build`

== Changelog ==

= 0.5 =
* Rename the plugin to "Carbon.txt" with the `carbon-txt` slug and text domain, as required for WordPress.org hosting.
* Remove the manual `load_plugin_textdomain()` call; WordPress loads translations automatically.
* Update the "Tested up to" version to 7.1.
* Validate your domain against the Green Web Foundation's hosted validator automatically after every save — no API key or setup required, with a settings-screen toggle to turn validation off.
* Remove the per-site Green Web Foundation API key field; the shared key used for validation now ships with the plugin.
* Document what external validation sends, in the "External validation" section.
* Stop offering the deprecated "web page" document type in the picker; new disclosures start at "sustainability page", and existing "web page" disclosures keep working.
* Mark required and optional fields in the editor, and report the entries skipped when saving because a required field was missing.
* Refresh the wording across the settings screen and update the Spanish translation.

= 0.4.1 =
* Add an optional Green Web Foundation API key field: after each save, the plugin asks the Green Web Foundation's hosted validator to validate your domain (publicly reachable domains only).
* Support additional carbon.txt spec versions via a per-version document-type table, and add an optional `domain` field to disclosures.
* Skip WordPress's canonical redirect for `/carbon.txt` so the file isn't redirected away from its expected path.
* Offer to export your disclosures before deactivating the plugin, and collapse the settings-page backup section by default.

= 0.3.0 =
* Check the well-known location (`/.well-known/carbon.txt`) for an existing file, with the same import and cleanup tools already offered for the domain root.
* Permanently delete an imported file once its disclosures have been saved, instead of renaming it aside.
* Add a "Keep a copy" section to copy your disclosures to the clipboard or download them as a file before deactivating or deleting the plugin.
* Detect a `carbon-txt-location` DNS TXT delegation record on your domain and warn that it takes priority over this plugin's output.

= 0.2.0 =
* Add a media library file picker as a third way to point a disclosure at a URL, alongside pasting one or selecting a page.
* Remember the selected page or file by ID, so revisiting a disclosure shows the same selection instead of falling back to a plain URL.
* Detect a carbon.txt file already on the server, warn that the web server may keep serving it directly, and offer to import disclosures found in it.
* Offer to rename an existing file aside as a dated backup (never deleted) once settings have been saved.

= 0.1.0 =
* Multiple organisational disclosures, each with a document type, a URL or page, and an optional title and valid-until date.
* Live preview and /carbon.txt endpoint.
* Add a Settings link on the Plugins screen and redirect to the settings page after activating the plugin on its own.
