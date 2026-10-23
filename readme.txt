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

`carbon.txt` is a single, recognisable place on your website, at
https://your-site.com/carbon.txt, where anyone can find out what your
organisation publishes about its own environmental impact.

This plugin builds that file for you. You describe your disclosures (the
public documents where you report your sustainability data) and the plugin
turns them into a valid `carbon.txt`, served straight from your site.

**What you can do with it:**

* **Add your disclosures.** One or more links to the documents that back
  up your claims: your annual report, your sustainability page, a
  certificate, and so on. Each one gets a document type, so readers know
  what they are looking at.
* **Point at any document.** Paste a URL, pick one of your published pages,
  or choose a file from your media library.
* **Record your certifications.** If your organisation holds a
  certification (a B Corp, an ecolabel, an ISO standard), list it once and
  link your disclosures to it.
* **Preview before you publish.** The settings screen shows the exact file
  that will be served, so you always know what visitors will get.
* **Start from what you already have.** If a `carbon.txt` already exists on
  your server, the plugin can read it and offer to import what it finds.
* **Keep a copy.** Your disclosures stay saved when you deactivate the
  plugin, and you can copy or download them at any time.

== Installation ==

1. Upload the plugin to `/wp-content/plugins/carbon-txt/`, or install the
   zip from **Plugins > Add New > Upload Plugin** in your dashboard.
2. Activate the plugin.
3. Go to **Settings > Carbon.txt** and add your first disclosure.
4. Press **Save and publish**. Your `carbon.txt` is now live at
   https://your-site.com/carbon.txt.

== How it works ==

**Document types.** The picker offers the document types the `carbon.txt`
syntax defines. The Green Web Foundation has deprecated the "web page"
type in favour of "sustainability page", so it is no longer offered, and
new disclosures start at "sustainability page". Disclosures that already
use "web page" keep working. They are labelled as deprecated in the editor,
so you can move them on when you get the chance.

**Required fields.** A disclosure needs a URL, and a certification needs a
title and a URL. Anything still missing one of those is skipped when you
save. The editor marks every field as required or optional, and tells you
what was left out.

**Certifications.** Each certification you list gets an id generated from
its title, and your disclosures reference that id. Only complete
certifications appear in the list you can choose from, so a half-finished
one never shows up as a blank entry.

**The file itself.** It is generated on request from your settings and
cached, so there is no physical file to manage and it survives deploys. It
is served from your site root even with plain permalinks. Every save
re-stamps the `last_updated` date.

**An existing file on your server.** If a `carbon.txt` already exists at
your domain root or at `/.well-known/carbon.txt`, the settings screen
warns you: your web server may keep serving that file instead of the one
this plugin generates. You can import the disclosures it finds, and the old
file is then permanently deleted once you save.

**DNS delegation.** If your domain has a `carbon-txt-location` TXT record
(see https://carbontxt.org/faq), that takes priority over any file this
plugin generates. The settings screen warns you when it finds one, so you
are not left wondering why your changes seem to have no effect.

**Validation.** After each save, the plugin asks the Green Web Foundation's
hosted validator to check your domain. Their validator fetches your live
`carbon.txt` from the web, so this needs a publicly reachable site. Local
and staging domains are skipped. A domain that passes is registered in your
Green Web Foundation dashboard. No key or setup is required, and validation
can be switched off from the settings screen. See "External validation"
below for exactly what is sent.

**Removing the plugin.** Deactivating keeps your disclosures and settings.
Deleting the plugin removes them, so the plugin offers to copy or download
your file first.

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

== Frequently Asked Questions ==

### Does this plugin create a file on my server?

No. The file is generated when a visitor requests it, and served from your
site root. There is nothing to upload and nothing to clean up.

### Why is my carbon.txt not the one I just saved?

Usually one of three things. A `carbon.txt` file already sitting on your
server is being served directly, a `carbon-txt-location` DNS record is
delegating discovery elsewhere, or you are on a local or staging domain
that isn't publicly reachable. The settings screen warns you about the
first two.

### What happens to my disclosures if I delete the plugin?

They are removed with it. Deactivating keeps them, and you can copy or
download your file from the settings screen at any time.

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
