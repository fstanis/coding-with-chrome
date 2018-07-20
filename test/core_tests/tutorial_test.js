/**
 * @fileoverview Tutorial tests
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
 */

describe('Tutorial', function() {
  document.body.insertAdjacentHTML('afterbegin', '<div id="cwc-editor"></div>');
  document.head.insertAdjacentHTML('afterbegin', '<link rel="stylesheet" href="css/editor.css">');

  let randomString = function(maxLength = 20, minLength = 1,
    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ' +
      '!@#$%^&*()-_=+`~[]{}\\|<>,./?;:\'"') {
    let length = Math.floor(Math.random() * (maxLength + minLength)) +
      minLength;
    let string = '';
    while (string.length < length) {
      string += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return string;
  };

  let testTutorial = async function(tutorial) {
    let builder = new cwc.ui.Builder();
    let metadata = {};
    if (tutorial) {
      metadata['__tutorial__'] = {};
      metadata['__tutorial__'][builder.getHelper().getUserLanguage()] =
        tutorial;
    }
    await builder.decorate();
    let fileLoaderInstance = builder.getHelper().getInstance('fileLoader');
    await fileLoaderInstance.handleFileData(JSON.stringify({
      'content': {
        'blockly': {
          'content': '',
          'name': 'blockly',
          'size': 894,
          'type': 'application/blockly+xml',
          'version': 1,
        },
        '__javascript__': {
          'content': 'draw.circle(150, 150, 100, "#ff0000", "#000000", 1);',
          'name': '__javascript__',
          'size': 53,
          'type': 'application/javascript',
          'version': 1,
        },
      },
      'files': {},
      'flags': {},
      'format': 'Coding with Chrome File Format 3.0',
      'frameworks': {},
      'history': '',
      'metadata': metadata,
      'mode': 'basic_blockly',
      'ui': 'blockly',
    }), 'tutorial-test-file.cwct', null, undefined);
    return builder;
  };

  let tutorialContainerId = 'cwc-tutorial-container';
  let tutorialStepContainerId = 'cwc-tutorial-step-container';

  let hasTutorial = function(builder) {
    let sidebarInstance = builder.getHelper().getInstance('sidebar');
    expect(sidebarInstance.isContentActive('tutorial')).toBe(true);
    let tutorialContentDiv = document.getElementById(tutorialContainerId);
    expect(tutorialContentDiv).not.toBeNull();
  };

  let getTutorialTemplate = (steps) => {
    let tutorialTemplate = {
        'description': {
          'text': randomString(),
          'mime_type': 'text/plain',
        },
      };
    if (steps === false) return tutorialTemplate;

    tutorialTemplate['steps'] = [];
    for (let i=0; i<steps; i++) {
      tutorialTemplate['steps'].push({
        'title': randomString(),
          'description': {
            'text': randomString(),
            'mime_type': 'text/plain',
          },
      });
    }

    return tutorialTemplate;
  };

  it('inactive if file has no tutorial metadata', async function() {
    let builder = await testTutorial(false);
    let sidebarInstance = builder.getHelper().getInstance('sidebar');
    expect(sidebarInstance.isContentActive('tutorial')).toBe(false);
    let tutorialContentDiv = document.getElementById(tutorialContainerId);
    expect(tutorialContentDiv).toBeNull();
  });

  it('opens if file has tutorial metadata', async function() {
    let builder = await testTutorial(getTutorialTemplate(false));
    hasTutorial(builder);
    let steps = document.getElementsByClassName(tutorialStepContainerId);
    expect(steps.length).toEqual(0);
  });

  let walkTutorial = async function(stepCount) {
      let tutorialTemplate = getTutorialTemplate(stepCount);
      let builder = await testTutorial(tutorialTemplate);
      hasTutorial(builder);

      // Correct content
      let steps = document.getElementsByClassName(tutorialStepContainerId);
      expect(steps.length).toEqual(stepCount);
      let description = document.getElementById('cwc-tutorial-description');
      expect(description).not.toBeNull();
      expect(description.textContent).toEqual(
        tutorialTemplate['description']['text']);

      // Validate step order and text
      [].slice.call(steps).forEach((step, index) => {
        if (index == 0) {
          expect(step.className)
            .toMatch(/\bcwc-tutorial-step-container--active\b/);
        } else {
          expect(step.className)
            .not.toMatch(/\bcwc-tutorial-step-container--active\b/);
        }

        let number = step.querySelector('.cwc-tutorial-step-number-text');
        expect(number).not.toBeNull();
        expect(parseInt(number.textContent)).toBe(index + 1);

        let title = step.querySelector('.cwc-tutorial-step-title');
        expect(title).not.toBeNull();
        expect(title.textContent).toEqual(
          tutorialTemplate['steps'][index]['title']);

        let stepDescription = step.querySelector(
          '.cwc-tutorial-step-description');
        expect(stepDescription).not.toBeNull();
        expect(stepDescription.textContent).toEqual(
          tutorialTemplate['steps'][index]['description']['text']);
      });

      // Click through each step
      for (let i=0; i < stepCount - 1; i++) {
        // Current step is visible
        let content = steps[i].querySelector('.cwc-tutorial-step-content');
        expect(content).not.toBeNull();
        expect(content.offsetParent).not.toBeNull();

        // Next step is not visible
        let nextContent = steps[i+1]
          .querySelector('.cwc-tutorial-step-content');
        expect(nextContent).not.toBeNull();
        expect(nextContent.offsetParent).toBeNull();

        // Click 'Continue'
        let button = content.querySelector('.cwc-tutorial-step-actions button');
        expect(button).not.toBeNull();
        button.click();

        // Old current step is no longer visible
        expect(content.offsetParent).toBeNull();
        expect(steps[i].className)
          .toMatch(/\bcwc-tutorial-step-container--complete\b/);

        // New current step is now visible
        expect(steps[i + 1].className)
          .toMatch(/\bcwc-tutorial-step-container--active\b/);
        expect(nextContent.offsetParent).not.toBeNull();
      }
    };

  it('displays 0 steps correctly', async function() {
    await walkTutorial(0);
  });
  it('displays 1 step correctly', async function() {
    await walkTutorial(1);
  });
  it('displays 2 steps correctly', async function() {
    await walkTutorial(2);
  });
  it('displays 6 steps correctly', async function() {
    await walkTutorial(6);
  });
  it('displays 9 steps correctly', async function() {
    await walkTutorial(9);
  });

  it('displays HTML content', async function() {
    let tutorialTemplate = {
        'description': {
          'text': '<h1><font color="red">Test tutorial</font></h1>',
          'mime_type': 'text/html',
        },
        'steps': [
          {
            'title': randomString(),
            'description': {
              'text': '<div><span>Step 1</span></div>',
              'mime_type': 'text/html',
            },
          },
        ],
      };

    let builder = await testTutorial(tutorialTemplate);
    hasTutorial(builder);
    let description = document.getElementById('cwc-tutorial-description');
    expect(description).not.toBeNull();
    expect(description.innerHTML.includes(
      tutorialTemplate['description']['text'])).toBe(true);

    let step = document.querySelector(
      '#cwc-tutorial-step-0 .cwc-tutorial-step-description');
    expect(step).not.toBeNull();
    expect(step.innerHTML.includes(
      tutorialTemplate['steps'][0]['description']['text'])).toBe(true);
  });

  it('displays markdown content', async function() {
    let textDescription = 'Test tutorial';
    let textStepDescription = 'This step is important';
    let tutorialTemplate = {
        'description': {
          'text': `# ${textDescription}`,
          'mime_type': 'text/markdown',
        },
        'steps': [
          {
            'title': randomString(),
            'description': {
              'text': `**${textStepDescription}**`,
              'mime_type': 'text/markdown',
            },
          },
        ],
      };

    let builder = await testTutorial(tutorialTemplate);
    hasTutorial(builder);
    let description = document.getElementById('cwc-tutorial-description');
    expect(description).not.toBeNull();
    expect(description.textContent.trim()).toEqual(textDescription);

    let step = document.querySelector(
      '#cwc-tutorial-step-0 .cwc-tutorial-step-description');
    expect(step).not.toBeNull();
    expect(step.textContent.trim()).toEqual(textStepDescription);
  });

  it('runs validation function', async function(done) {
    let validate = function() {
      return {
        'solved': false,
        'message': 'TEST_MESSAGE',
      };
    };
    let tutorialTemplate = getTutorialTemplate(1);
    tutorialTemplate['steps'][0]['validate'] = validate.toString();
    let builder = await testTutorial(tutorialTemplate);
    hasTutorial(builder);

    let stepMessage = document.querySelector(
        '#cwc-tutorial-step-0 .cwc-tutorial-step-message');
    expect(stepMessage).not.toBeNull();
    expect(stepMessage.offsetParent).toBeNull();

    // Give validate time to run
    await new Promise(function(resolve) {
      setTimeout(resolve, 2000);
    });

    expect(stepMessage.offsetParent).not.toBeNull();
    expect(stepMessage.innerHTML).toBe('TEST_MESSAGE');
    expect(stepMessage.className).not.toMatch(/\bsolved\b/);
    done();
  });

  it('honors validation function solved flag', async function() {
    let validate = function() {
      return {
        'solved': true,
        'message': 'TEST_MESSAGE_2',
      };
    };
    let tutorialTemplate = getTutorialTemplate(1);
    tutorialTemplate['steps'][0]['validate'] = validate.toString();
    let builder = await testTutorial(tutorialTemplate);
    hasTutorial(builder);

    let stepMessage = document.querySelector(
        '#cwc-tutorial-step-0 .cwc-tutorial-step-message');
    expect(stepMessage).not.toBeNull();
    expect(stepMessage.offsetParent).toBeNull();

    // Give validate time to run
    await new Promise(function(resolve) {
      setTimeout(resolve, 2000);
    });

    expect(stepMessage.offsetParent).not.toBeNull();
    expect(stepMessage.innerHTML).toBe('TEST_MESSAGE_2');
    expect(stepMessage.className).toMatch(/\bsolved\b/);
  });
});
