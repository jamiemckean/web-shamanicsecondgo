
window.isSignaturePadInitialized = false;
window.initializeSignaturePad = function () {
  if (window.isSignaturePadInitialized) return;
  window.isSignaturePadInitialized = true;
  
  jQuery('.pad').each(function(idx, el) {
    var pad = jQuery(el);
    var contextWidth = el.dataset.width;
    var contextHeight = el.dataset.height;
    var signatureLine = el.dataset['signature-line'] === '1';
  
    // set widths to pad and signature canvas
    pad.jSignature({
      width: contextWidth,
      height: contextHeight,
      signatureLine: signatureLine
    });

    // bind changes - emits 'change' event immediately after a stroke
    pad.on('change', function() {
      var focusedElement = document.querySelector(':focus');
      if (focusedElement) {
        focusedElement.blur();
      }
      var thispad = jQuery(this);
      var qid = thispad.attr('data-id');
      if (thispad && typeof thispad.jSignature !== 'undefined' && thispad.jSignature('getData', 'base30')[1].length > 0) {
        var sigdata = thispad.jSignature('getData');
        jQuery('#input_' + qid).val(sigdata);
        JotForm.triggerWidgetCondition(qid);
      }
    });
  });

  jQuery('.clear-pad').on('click keypress', function(e) {
    if (e.type === 'click' || e.keyCode === 13) {
      var pad = jQuery(this).parent().parent().find('.pad');

      if (!pad.jSignature('getSettings').readOnly) {
        pad.jSignature('reset');

        // clear input field as well
        var qid = pad.attr('data-id');
        jQuery('#input_' + qid).val('');
        JotForm.triggerWidgetCondition(qid);
      }
    }
  });

  jQuery('.jotform-form').on('submit', function(e) {
    if (JotForm && JotForm.isWorkflowForm) return;
    jQuery('.pad').each(function(idx, el) {
      var pad = jQuery(el);
      if (!pad.hasClass('edit-signature') && pad.jSignature('getData', 'base30')[1].length > 0) {
        var id = pad.attr('data-id');
        jQuery('#input_' + id).val(pad.jSignature('getData'));
      }
    });
  });

  //@diki
  //edit mode
  if (JotForm.isEditMode() || typeof document.get.session !== 'undefined' || (window.JFForm && window.JFForm.draftID) || document.location.href.match(/\/edit\//) || /offline_forms=true/.test(window.location.href)) {
    jQuery('.jotform-form').on('click keypress', '.edit-signature-pad', function(e) {
      if (e.type === 'click' || e.keyCode === 13) {
        // get pad and the pad id
        var sigId = jQuery(this).attr('data-id');
        var pad = jQuery('.pad#sig_pad_' + sigId);

        // if there's a sig image and want to clear it
        if (jQuery('img.signature-image-' + sigId).length > 0) {
          if (!pad.jSignature('getSettings').readOnly) {
            // show the pad and hide flag class
            pad.removeClass('edit-signature').show();

            // remove value from the input
            jQuery('#input_' + sigId).val('');

            // remove current signature image
            jQuery('img.signature-image-' + sigId).remove();
          }
        } else {
          // reset pad
          if (!pad.jSignature('getSettings').readOnly) {
            pad.jSignature('reset');
          }
        }
      }
    });
  }
};

jQuery(document).ready(window.initializeSignaturePad);
