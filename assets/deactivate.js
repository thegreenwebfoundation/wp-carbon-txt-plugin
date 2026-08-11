/**
 * Deactivation safety net for the Plugins screen. While this plugin is
 * still active there, intercept its own "Deactivate" link and offer to
 * copy or download the disclosures first — removing the plugin also
 * removes its saved settings. Bulk actions and WP-CLI bypass this click;
 * the settings-page "Keep a copy" section still covers those.
 */
( function () {
	const data = window.wpCarbonTxtDeactivate;
	if ( ! data ) {
		return;
	}

	const link = document.querySelector(
		'tr[data-plugin="' + CSS.escape( data.pluginFile ) + '"] .deactivate a'
	);
	if ( ! link ) {
		return;
	}

	const { content, i18n } = data;

	// navigator.clipboard only exists in secure contexts (HTTPS/localhost);
	// on plain HTTP it's absent, so fall back to a temporary textarea.
	const copyToClipboard = ( text ) => {
		if ( window.navigator.clipboard && window.isSecureContext ) {
			return window.navigator.clipboard.writeText( text );
		}

		return new Promise( ( resolve, reject ) => {
			const textarea = document.createElement( 'textarea' );
			textarea.value = text;
			textarea.setAttribute( 'readonly', '' );
			textarea.style.position = 'fixed';
			textarea.style.top = '-1000px';
			document.body.appendChild( textarea );
			textarea.select();

			let ok = false;
			try {
				ok = document.execCommand( 'copy' );
			} catch ( error ) {
				ok = false;
			}

			document.body.removeChild( textarea );

			if ( ok ) {
				resolve();
			} else {
				reject( new Error( 'copy-failed' ) );
			}
		} );
	};

	const downloadFile = () => {
		const url = URL.createObjectURL(
			new Blob( [ content ], { type: 'text/plain' } )
		);
		const anchor = document.createElement( 'a' );
		anchor.href = url;
		anchor.download = 'carbon.txt';
		anchor.click();
		URL.revokeObjectURL( url );
	};

	// Build the modal once and toggle it with the `hidden` attribute.
	const titleId = 'wp-carbon-txt-modal-title';

	const heading = document.createElement( 'h2' );
	heading.id = titleId;
	heading.textContent = i18n.title;

	const message = document.createElement( 'p' );
	message.textContent = i18n.message;

	const status = document.createElement( 'p' );
	status.className = 'screen-reader-text';
	status.setAttribute( 'aria-live', 'polite' );

	const copyButton = document.createElement( 'button' );
	copyButton.type = 'button';
	copyButton.className = 'button button-secondary';

	const downloadButton = document.createElement( 'button' );
	downloadButton.type = 'button';
	downloadButton.className = 'button button-secondary';
	downloadButton.textContent = i18n.download;

	const proceedButton = document.createElement( 'a' );
	proceedButton.className = 'button button-primary';
	proceedButton.href = link.href;
	proceedButton.textContent = i18n.deactivate;

	const cancelButton = document.createElement( 'button' );
	cancelButton.type = 'button';
	cancelButton.className = 'button-link';
	cancelButton.textContent = i18n.cancel;

	const actions = document.createElement( 'div' );
	actions.className = 'wp-carbon-txt-modal__actions';
	actions.append( copyButton, downloadButton, proceedButton, cancelButton );

	const dialog = document.createElement( 'div' );
	dialog.className = 'wp-carbon-txt-modal';
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-modal', 'true' );
	dialog.setAttribute( 'aria-labelledby', titleId );
	dialog.append( heading, message, actions, status );

	const overlay = document.createElement( 'div' );
	overlay.className = 'wp-carbon-txt-modal-overlay';
	overlay.hidden = true;
	overlay.append( dialog );
	document.body.append( overlay );

	const focusables = [
		copyButton,
		downloadButton,
		proceedButton,
		cancelButton,
	];
	let lastFocused = null;

	function close() {
		overlay.hidden = true;
		document.removeEventListener( 'keydown', onKeydown );
		if ( lastFocused ) {
			lastFocused.focus();
		}
	}

	// Escape closes; Tab is trapped within the dialog's controls.
	function onKeydown( event ) {
		if ( 'Escape' === event.key ) {
			close();
			return;
		}
		if ( 'Tab' !== event.key ) {
			return;
		}

		const first = focusables[ 0 ];
		const last = focusables[ focusables.length - 1 ];
		const active = overlay.ownerDocument.activeElement;

		if ( event.shiftKey && active === first ) {
			event.preventDefault();
			last.focus();
		} else if ( ! event.shiftKey && active === last ) {
			event.preventDefault();
			first.focus();
		}
	}

	function open() {
		lastFocused = overlay.ownerDocument.activeElement;
		copyButton.textContent = i18n.copy;
		status.textContent = '';
		overlay.hidden = false;
		copyButton.focus();
		document.addEventListener( 'keydown', onKeydown );
	}

	link.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		open();
	} );

	copyButton.addEventListener( 'click', () => {
		copyToClipboard( content ).then(
			() => {
				copyButton.textContent = i18n.copied;
				status.textContent = i18n.copied;
			},
			() => {
				status.textContent = i18n.copyError;
			}
		);
	} );

	downloadButton.addEventListener( 'click', downloadFile );
	cancelButton.addEventListener( 'click', close );
	overlay.addEventListener( 'click', ( event ) => {
		if ( event.target === overlay ) {
			close();
		}
	} );
} )();
