/**
 * @fileoverview Tutorial
 *
 * @license Copyright 2018 The Coding with Chrome Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @author carheden@google.com (Adam Carheden)
 * @author mdiehl@workbenchplatform.com (Matt Diehl)
 * @author mbordihn@google.com (Markus Bordihn)
 */
goog.provide('cwc.ui.Tutorial');

goog.require('cwc.mode.Modder.Events');
goog.require('cwc.mode.Type');
goog.require('cwc.renderer.Helper');
goog.require('cwc.soy.ui.Tutorial');
goog.require('cwc.utils.Database');
goog.require('cwc.utils.Helper');
goog.require('cwc.utils.Events');
goog.require('cwc.utils.Logger');
goog.require('cwc.utils.mime.Type');
goog.require('cwc.utils.Resources');

goog.require('goog.dom');
goog.require('goog.html.SafeHtml');
goog.require('goog.html.sanitizer.HtmlSanitizer');
goog.require('goog.events');
goog.require('goog.soy');
goog.require('goog.string');
goog.require('goog.style');
goog.require('soydata.VERY_UNSAFE');

/**
 * @param {!cwc.utils.Helper} helper
 * @constructor
 * @struct
 * @final
 */
cwc.ui.Tutorial = function(helper) {
  /** @type {string} */
  this.name = 'Tutorial';

  /** @type {!cwc.utils.Helper} */
  this.helper = helper;

  /** @type {!cwc.renderer.Helper} */
  this.rendererHelper = new cwc.renderer.Helper();

  /** @type {string} */
  this.prefix = this.helper.getPrefix('tutorial');

  /** @private {!cwc.utils.Logger} */
  this.log_ = new cwc.utils.Logger(this.name);

  /** @private {!string} */
  this.activeStepClass_ = this.prefix + 'step-container--active';

  /** @private {!string} */
  this.completedStepClass_ = this.prefix + 'step-container--complete';

  /** @private {!Element} */
  this.nodeMediaOverlay_ = null;

  /** @private {!Element} */
  this.nodeMediaOverlayClose_ = null;

  /** @private {!Element} */
  this.nodeMediaOverlayContent_ = null;

 /** @private {!cwc.utils.Database} */
  this.imagesDb_ = null;

  /** @private {!string} */
  this.description_ = '';

  /** @private {!string} */
  this.url_ = '';

  /** @private {!Array<object>} */
  this.steps_ = [];

  /** @private {!Object} */
  this.state_ = {};

  /** @private {!cwc.utils.Events} */
  this.events_ = new cwc.utils.Events(this.name, '', this);

  /** @private {boolean} */
  this.webviewSupport_ = this.helper.checkChromeFeature('webview');

  /** @private {!boolean} */
  this.contentSet_ = false;

  /** @private {!Array<DOMString>} */
  this.objectURLs_ = [];
};


/**
 * @param {!Object} tutorial
 * @param {!cwc.utils.Database} imagesDb
 */
cwc.ui.Tutorial.prototype.setTutorial = async function(tutorial, imagesDb) {
  this.log_.info('Setting tutorial', tutorial);
  this.clear();
  if (!tutorial) {
    this.log_.info('No tutorial');
    return;
  }

  if (imagesDb) {
    this.imagesDb_ = imagesDb;
  } else {
    const objectStoreName = '__tutorial__';
    this.imagesDb_ = new cwc.utils.Database('Tutorial')
    .setObjectStoreName(objectStoreName);
    await this.imagesDb_.open({'objectStoreNames': [objectStoreName]});
  }

  let steps = [];
  if ('steps' in tutorial) {
    if (!Array.isArray(tutorial['steps'])) {
      this.log_.warn('Ignoring invalid steps', tutorial['steps'],
        '(Expecting an array)');
    } else {
      steps = tutorial['steps'];
    }
  }
  await this.parseSteps_(steps);

  this.url_ = tutorial['url'];

  let processDescription = true;
  if (typeof tutorial['description'] !== 'object') {
    this.log_.warn('description is not an object:', tutorial['description']);
    processDescription = false;
  }
  if (!('text' in tutorial['description'])) {
    this.log_.warn('description has no text:', tutorial['description']);
    processDescription = false;
  }
  if (!('mime_type' in tutorial['description'])) {
    this.log_.warn('description has no mime_type:', tutorial['description']);
    processDescription = false;
  }
  if (processDescription) {
    let description = this.parseDescription_(tutorial['description']['text'],
      tutorial['description']['mime_type']);
    if (description !== false) {
      this.description_ = description;
    } else {
      this.log_.warn('Description should be an object with "text" and',
        '"mime_type" keys, got', tutorial['description']);
    }
  }

  this.contentSet_ = true;
  this.helper.getInstance('sidebar').enableTutorial(true);
};


cwc.ui.Tutorial.prototype.hasTutorial = function() {
  return this.contentSet_;
};


/**
 * @param {!object} steps
 * @private
 */
cwc.ui.Tutorial.prototype.parseSteps_ = async function(steps) {
  this.log_.info('Loading steps', steps);

  if (this.steps_.length != 0) {
    this.log_.warn('Replacing existing steps', this.steps_);
  }
  this.steps_ = [];

  await Promise.all(steps.map((step, id) => {
    return this.addStep_(step, id);
  }));
};

/**
 * @param {!object} stepTemplate
 * @param {!int} id
 * @private
 */
cwc.ui.Tutorial.prototype.addStep_ = async function(stepTemplate, id) {
  let step = {
    id: id,
    title: '',
    description: '',
    validate: false,
    code: false,
    images: [],
    videos: [],
  };

  if (typeof stepTemplate['title'] === 'string') {
    step.title = stepTemplate['title'];
  } else {
    this.log_.warn('Step', id, 'has no title');
  }

  if (stepTemplate['validate']) {
    step.validate = stepTemplate['validate'];
  }

  if ('code' in stepTemplate) {
    if (typeof stepTemplate['code'] === 'string') {
      step.code = stepTemplate['code'];
    } else {
      this.log_.warn('Expecting string for code of step ', id,
        ', got ', stepTemplate['code']);
    }
  }

  const ensureBlobInDB = async (key, data, warnOnOverwrite = false) => {
    if (warnOnOverwrite) {
      let existingData = await this.imagesDb_.get(key);
      if (existingData) {
        this.log_.warn('Overwriting', key);
      }
    }
    await this.imagesDb_.set(key, data);
  };

  const ensureUrlInDB = async (url, offlineMessage) => {
    let existingData = await this.imagesDb_.get(url);
    if (existingData) {
      this.log_.info('Not downloading', url,
        'because it is already in the database');
      return;
    }

    if (this.helper.checkFeature('online')) {
      this.log_.warn(offlineMessage);
      return;
    }

    let blob = await cwc.utils.Resources.getUriAsBlob(url);
    await ensureBlobInDB(url, blob);
  };

  const appendBinaries = async (source, destination, name) => {
    await Promise.all(source.map((spec, index) => {
      switch (typeof spec) {
        case 'string': {
          this.log_.info('Loading data for', spec);
          return ensureUrlInDB(spec, 'Ignoring '+name+' index '+index+
            ' with url '+spec+' from step '+id+' because we are offline'
          ).then(() => {
            destination[index] = spec;
          });
        }
        case 'object': {
          if (!('mime_type' in spec)) {
            this.log_.warn('Ignoring', name, index, 'from step', id,
              'because object is missing the \'mime_type\' key:', spec);
            break;
          }
          if (!('data' in spec)) {
            this.log_.warn('Ignoring', name, index, 'from step', id,
              'because object is missing the \'data\' key:', spec);
            break;
          }
          const binaryData = atob(spec['data']);
          const encodedData = new Uint8Array(binaryData.length);
          for (let i=0; i<binaryData.length; i++) {
            encodedData[i] = binaryData.charCodeAt(i);
          }
          const blob = new Blob([encodedData], {'type': spec['mime_type']});
          let key = goog.string.createUniqueString();
          this.log_.info('Loading data for', key);
          return ensureBlobInDB(key, blob, true).then(() => {
            destination[index] = key;
          });
        }
        default: {
          this.log_.warn('Ignoring', name, index, 'from step', id,
            'because it is neither a string nor an object', spec);
        }
      }
      return new Promise((resolved) => {
        resolved();
       });
    }));
  };
  if (Array.isArray(stepTemplate['images'])) {
    await appendBinaries(stepTemplate['images'], step.images, 'image');
  }

  if (Array.isArray(stepTemplate['videos'])) {
    step.videos = stepTemplate['videos'];
  }

  if (typeof stepTemplate['description'] !== 'object') {
    this.log_.error('Skipping step', id, 'because it has invalid or ' +
      'missing description:', stepTemplate['description']);
    return;
  }
  if (typeof stepTemplate['description']['text'] !== 'string') {
    this.log_.error('Skipping step', id, 'because it\'s description ' +
      'has invalid or missing text:', stepTemplate['description']);
    return;
  }
  if (typeof stepTemplate['description']['mime_type'] !== 'string') {
    this.log_.error('Skipping step', id, 'because it\'s description '+
      'has invalid or missing mime_type:', stepTemplate['description']);
    return;
  }
  step.description = this.parseDescription_(stepTemplate['description']['text'],
    stepTemplate['description']['mime_type']);
  if (!step.description) {
    this.log_.error('Skipping step', id, 'because parsing it\'s ' +
      'description failed', stepTemplate['description']);
    return;
  }

  this.steps_[id] = step;
};

/**
 * @param {!string} text
 * @param {!string} mimeType
 * @private
 * @return {!bool|string}
 */
cwc.ui.Tutorial.prototype.parseDescription_ = function(text, mimeType) {
  const sanitizer = new goog.html.sanitizer.HtmlSanitizer();
  switch (mimeType) {
    case cwc.utils.mime.Type.HTML.type: {
      return soydata.VERY_UNSAFE.ordainSanitizedHtml(
        goog.html.SafeHtml.unwrap(sanitizer.sanitize(text)));
    }
    case cwc.utils.mime.Type.MARKDOWN.type: {
      if (this.helper.checkJavaScriptFeature('marked')) {
        return soydata.VERY_UNSAFE.ordainSanitizedHtml(
          goog.html.SafeHtml.unwrap(sanitizer.sanitize(marked(text))));
      } else {
        this.log_.warn('Markdown not supported, displaying description text',
          text);
        return text;
      }
    }
    case cwc.utils.mime.Type.TEXT.type: {
      return text;
    }
    default: {
      this.log_.error('Unknown or unsupported mime type', mimeType);
    }
  }
  return false;
};

cwc.ui.Tutorial.prototype.startTutorial = function() {
  this.log_.info('Starting tutorial ...');
  if (!this.hasTutorial()) {
    this.log_.error('Attempt to start tutorial before setting tutorial.');
    return;
  }
  const sidebarInstance = this.helper.getInstance('sidebar');
  const videoExtensions = ['mp4', 'webm', 'ogg'];
  if (sidebarInstance) {
    sidebarInstance.showTemplateContent('tutorial', 'Tutorial',
      cwc.soy.ui.Tutorial.template, {
        prefix: this.prefix,
        description: this.description_,
        online: this.helper.checkFeature('online'),
        url: this.url_ ? this.url_ : '',
        steps: this.steps_.map((step, index) => ({
          id: index,
          description: step.description,
          images: step.images.filter((url = '') =>
            !videoExtensions.some((ext) => url.endsWith(ext))
          ),
          number: index + 1,
          title: step.title || `Step ${index + 1}`,
          videos: step.images.filter((url = '') =>
            videoExtensions.some((ext) => url.endsWith(ext))
          ),
          youtube_videos: (step.videos || []).map((video) =>
            video['youtube_id']
          ),
        })),
      });
  }

  this.state_ = {
    completedSteps: [],
    activeStepID: null,
    inProgressStepID: null,
  };

  this.initUI_();
  this.startValidate();
};

/**
 * Actions that happen after the template is rendered:
 * add event listeners, show active step, render images from DB
 * @private
 */
cwc.ui.Tutorial.prototype.initUI_ = function() {
  this.initSteps_();
  this.initMedia_();

  let state = {};
  if (this.steps_.length > 0) {
    state.activeStepID = this.state_.activeStepID || this.steps_[0].id;
  }
  this.setState_(state);
};

/**
 * Captures references to elements needed by the media overlay
 * @private
 */
cwc.ui.Tutorial.prototype.initMediaOverlay_ = function() {
  this.nodeMediaOverlay_ = goog.dom.getElement(this.prefix + 'media-overlay');
  this.nodeMediaOverlayClose_ = goog.dom.getElement(
    this.prefix + 'media-overlay-close');
  this.nodeMediaOverlayContent_ = goog.dom.getElement(
    this.prefix + 'media-overlay-content');

  this.nodeMediaOverlayClose_.addEventListener('click', () => {
    this.setState_({
      expandedMedia: null,
    });
  });
};


/**
 * Renders cached images and videos from database to DOM
 * @private
 */
cwc.ui.Tutorial.prototype.initMedia_ = function() {
  this.initMediaOverlay_();
  let rootNode = goog.dom.getElement(this.prefix + 'container');
  let nodeListImages = rootNode.querySelectorAll('.js-project-step-image');
  if (this.imagesDb_) {
    [].forEach.call(nodeListImages, (image) => {
      let imageSrc = image.getAttribute('data-src');
      this.imagesDb_.get(imageSrc).then((blob) => {
        if (blob) {
          let objectURL = URL.createObjectURL(blob);
          image.src = objectURL;
          this.objectURLs_.push(objectURL);
        } else {
          image.remove();
        }
      });
    });
  }
};

/**
 * Sets initial state for each step
 * @private
 */
cwc.ui.Tutorial.prototype.initSteps_ = function() {
  let prefix = this.prefix + 'step-';
  this.steps_.forEach((step) => {
    let stepNode = goog.dom.getElement(prefix + step.id);
    step.node = stepNode;
    step.nodeContinue = stepNode.querySelector(
        '.js-project-step-continue');
    step.nodeHeader = stepNode.querySelector(
        '.js-project-step-header'),
    step.nodeListMediaExpand = stepNode.querySelectorAll(
        '.js-project-step-media-expand');
    step.nodeMessage = stepNode.querySelector('.'+prefix+'message');
    goog.style.setElementShown(step.nodeMessage, false);
  });
  this.initStepButtons_();
};


/**
 * Sets initial state for each step
 * @private
 */
cwc.ui.Tutorial.prototype.initStepButtons_ = function() {
  this.steps_.forEach((step) => {
    if (step.nodeContinue) {
      goog.events.listen(step.nodeContinue, goog.events.EventType.CLICK,
        this.completeCurrentStep_.bind(this));
    }
    goog.events.listen(step.nodeHeader, goog.events.EventType.CLICK,
      this.jumpToStep_.bind(this, step.id));

    [].forEach.call(step.nodeListMediaExpand, (toggle) => {
      goog.events.listen(toggle, goog.events.EventType.CLICK,
        this.onMediaClick_.bind(this, toggle));
    });
  });
};


/**
 * Marks the current step complete and opens the next
 * @private
 */
cwc.ui.Tutorial.prototype.completeCurrentStep_ = function() {
  let completedSteps = this.state_.completedSteps.slice();
  let currentStepIndex = this.steps_.findIndex((step) =>
    step.id === this.state_.activeStepID);
  let nextStep = this.steps_[currentStepIndex + 1] || {};
  if (!completedSteps.includes(this.state_.activeStepID)) {
    completedSteps.push(this.state_.activeStepID);
  }
  this.setState_({
    completedSteps: completedSteps,
    activeStepID: nextStep.id,
    inProgressStepID: nextStep.id,
  });
};


/**
 * Opens a step, but only if it is complete or next
 * @param {!number} stepID
 * @private
 */
cwc.ui.Tutorial.prototype.jumpToStep_ = function(stepID) {
  let canOpen = stepID === this.state_.inProgressStepID ||
    this.state_.completedSteps.includes(stepID);
  if (canOpen) {
    this.setState_({
      activeStepID: stepID,
    });
  }
};

/**
 * @private
 * @return {!Object}
 */
cwc.ui.Tutorial.prototype.getActiveStep_ = function() {
  return this.steps_[this.state_.activeStepID];
};


/**
 * @private
 * @return {!Object|boolean}
 */
cwc.ui.Tutorial.prototype.getActiveMessageNode_ = function() {
  let step = this.getActiveStep_();
  if (!step) {
    this.log_.warn('No active step, activeStepID = ', this.state_.activeStepID);
    return false;
  }
  return step.nodeMessage;
};

/**
 * Shows media in a full screen overlay
 * @param {Element} button
 * @private
 */
cwc.ui.Tutorial.prototype.onMediaClick_ = function(button) {
  let mediaType = button.getAttribute('data-media-type');
  let mediaImg = button.querySelector('img');
  let youtubeId = button.getAttribute('data-youtube-id');
  let videoUrl = button.getAttribute('data-video-url');

  if (mediaType === 'image' && mediaImg) {
    let clone = mediaImg.cloneNode(true);
    clone.removeAttribute('class');
    this.setState_({
      expandedMedia: clone,
    });
  } else if (mediaType === 'youtube' && youtubeId) {
    let content = document.createElement(
      this.webviewSupport_ ? 'webview' : 'iframe');
    content.src = `https://www.youtube-nocookie.com/embed/${youtubeId}/?rel=0&amp;autoplay=0&showinfo=0`;

    this.setState_({
      expandedMedia: content,
    });
  } else if (mediaType === 'video') {
    let video = document.createElement('video');
    this.imagesDb_.get(videoUrl).then((blob) => {
      if (blob) {
        let objectURL = URL.createObjectURL(blob);
        video.src = objectURL;
        this.objectURLs_.push(objectURL);
        video.controls = true;
        this.setState_({
          expandedMedia: video,
        });
      } else {
        video.remove();
      }
    });
  }
};


/**
 * Event fired on media overlay close button click
 * @private
 */
cwc.ui.Tutorial.prototype.onMediaClose_ = function() {
  this.setState_({
    expandedMedia: null,
  });
};


/**
 * Closes media overlay
 * @priate
 */
cwc.ui.Tutorial.prototype.hideMedia_ = function() {
  while (this.nodeMediaOverlayContent_.firstChild) {
    this.nodeMediaOverlayContent_.firstChild.remove();
  }
  this.nodeMediaOverlay_.classList.add('is-hidden');
};


/**
 * Shows media overlay with the provided element
 * @param {!Element} media
 * @private
 */
cwc.ui.Tutorial.prototype.showMedia_ = function(media) {
  this.nodeMediaOverlayContent_.appendChild(media);
  this.nodeMediaOverlay_.classList.remove('is-hidden');
};


/**
 * Updates the current state, then triggers a view update
 * @param {!Object} change
 * @private
 */
cwc.ui.Tutorial.prototype.setState_ = function(change) {
  let prevStepID = this.state_.activeStepID;
  Object.keys(change).forEach((key) => {
    this.state_[key] = change[key];
  });
  if (prevStepID !== this.state_.activeStepID) {
    let editorInstance = this.helper.getInstance('editor');
    if (editorInstance && this.getActiveStep_().code) {
      // TODO: support multiple editor views
      editorInstance.setEditorContent(this.getActiveStep_().code,
        editorInstance.getCurrentView());
    }
  }
  this.updateView_();
};


/**
 * Updates the view to reflect the current state
 * @private
 */
cwc.ui.Tutorial.prototype.updateView_ = function() {
  this.steps_.forEach((step) => {
    // active step
    if (step.id === this.state_.activeStepID) {
      step.node.classList.add(this.activeStepClass_);
    } else {
      step.node.classList.remove(this.activeStepClass_);
    }

    // completed steps
    if (this.state_.completedSteps.includes(step.id)) {
      step.node.classList.add(this.completedStepClass_);
    } else {
      step.node.classList.remove(this.completedStepClass_);
    }
  });

  if (this.state_.expandedMedia) {
    this.showMedia_(this.state_.expandedMedia);
  } else {
    this.hideMedia_();
  }
};

/**
 * Logs console messages from the tutorial webview
 * @param {Event} event
 * @private
 */
cwc.ui.Tutorial.prototype.handleConsoleMessage_ = function(event) {
  let browserEvent = event.getBrowserEvent();
  // TODO: Log this to a tutorial developer console once we build one
  this.log_.info('['+browserEvent.level+']: '+browserEvent.message);
};

/**
 * Runs validate() each time the preview reloads
 */
cwc.ui.Tutorial.prototype.startValidate = function() {
  // This attempts to run in case CONTENT_LOAD_STOP has already fired
  this.runValidate();
  // This runs on future CONTENT_LOAD_STOP events
  let previewInstance = this.helper.getInstance('preview');
  if (!previewInstance) {
    this.log_.error('No preview instance');
    return;
  }
  goog.events.listen(previewInstance.getEventTarget(),
    this.webviewSupport_ ? cwc.ui.PreviewEvents.Type.CONTENT_LOAD_STOP :
      cwc.ui.PreviewEvents.Type.CONTENT_LOADED,
    this.runValidate.bind(this), false, this);
};

/**
 * @param {Object} preview
 */
cwc.ui.Tutorial.prototype.runValidate = async function() {
  if (!this.getActiveStep_() || !this.getActiveStep_().validate) {
    return;
  }
  let previewInstance = this.helper.getInstance('preview');
  if (!previewInstance) {
    this.log_.warn('runValidate: No preview instance');
    return;
  }

  let editorInstance = this.helper.getInstance('editor');
  // TODO: support multiple editor views
  let code = goog.string.quote(
    editorInstance.getEditorContent(editorInstance.getCurrentView()));
  let injectCode = `{ return (${this.getActiveStep_().validate})(${code}) }`;

  let result;
  try {
    result = await previewInstance.executeScript(injectCode);
  } catch (error) {
    this.log_.warn('Validation script failed to run', error);
    return;
  }

  this.log_.info('Validate script returned', result);
  if (typeof result !== 'object') {
    this.log_.warn('Ignoring script result because it is not an object');
    return;
  }
  if ('message' in result && result['message']) {
    this.setMessage(result['message']);
  } else {
    this.setMessage('');
  }
  if ('solved' in result) {
    this.solved(result['solved']);
  } else {
    this.solved(false);
  }
};


/**
 * Callback for validate
 * @param {!object} results
 * @private
 */
cwc.ui.Tutorial.prototype.processValidateResults_ = function(results) {
  this.log_.info('processing validate results', results);
  let message = '';
  let solved = false;
  if (results.length >= 1) {
    switch (typeof results[0]) {
      case 'string':
        message = results[0];
        break;
      case 'boolean':
        solved = results[0];
        break;
      case 'object':
        if ('message' in results[0]) message = results[0]['message'];
        if ('solved' in results[0]) solved = results[0]['solved'];
        break;
      default:
        this.log_.warn('validate returned unknown type: ',
          results[0]);
    }
  } else {
    this.log_.warn('Empty results');
  }
  this.solved(solved);
  this.setMessage(message);
};

/**
 * @param {string} message
 */
cwc.ui.Tutorial.prototype.setMessage = function(message) {
  let node = this.getActiveMessageNode_();
  if (!node) {
    this.log_.warn('No active message node, can\'t set message ', message);
    return;
  }
  if (message) {
    goog.soy.renderElement(node, cwc.soy.ui.Tutorial.message,
      {message: message});
  }
  goog.style.setElementShown(node, message ? true : false);
};

/**
 * @param {!boolean} solved
 */
cwc.ui.Tutorial.prototype.solved = function(solved) {
  let node = this.getActiveMessageNode_();
  if (!node) {
    this.log_.warn('No active message node, can\'t solved to', solved);
    return;
  }
  if (solved) {
    goog.dom.classlist.add(node, 'solved');
  } else {
    goog.dom.classlist.remove(node, 'solved');
  }
};


cwc.ui.Tutorial.prototype.clear = function() {
  this.state_ = {};
  this.steps_ = [];
  this.description_ = '';
  this.url_ = '';
  this.contentSet_ = false;
  this.imagesDb_ = false;
  this.nodeMediaOverlay_ = null;
  this.nodeMediaOverlayClose_ = null;
  this.nodeMediaOverlayContent_ = null;
  this.events_.clear();
  while (this.objectURLs_.length > 0) {
    URL.revokeObjectURL(this.objectURLs_.pop());
  }
  let sidebarInstance = this.helper.getInstance('sidebar');
  if (sidebarInstance) {
    sidebarInstance.clear();
  }
};
