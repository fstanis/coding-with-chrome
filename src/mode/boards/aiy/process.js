/**
 * @fileoverview AIY process manager.
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
 * @author fstanis@google.com (Filip Stanis)
 */
goog.provide('cwc.mode.aiy.Process');

goog.require('cwc.utils.Events');
goog.require('cwc.protocol.aiy.Api');


/**
 * @constructor
 * @param {!cwc.utils.Helper} helper
 */
cwc.mode.aiy.Process = function(socket) {
  /** @type {string} */
  this.name = 'AIY Process instance';

  /** @type {!WebSocket} */
  this.socket_ = socket;

  /** @private {!cwc.utils.Events} */
  this.events_ = new cwc.utils.Events(this.name);

  /** @private {cwc.protocol.aiy.Api} */
  this.api_ = new cwc.protocol.aiy.Api(socket);
};


/**
 * Performs init.
 * @export
 */
cwc.mode.aiy.Process.prototype.exitPromise_ = function() {
  if (!this.api_.isConnected()) {
    return Promise.reject(new Error('AIY is not connected'));
  }
  return new Promise((resolve, reject) => {
    this.socket_.addEventListener('close', (event) => {
      reject(new Error('The socket was closed before the process exited cleanly.'));
    }, false);
    this.events_.listen(this.api_.getEventHandler(),
      cwc.protocol.aiy.Events.Type.EXIT,
      code => {
        this.socket_.close();
        resolve(code);
      }
    );
  });
};


/**
 * @param {!string} code
 * @export
 */
cwc.mode.aiy.Process.prototype.runPython = function(code) {
  const result = this.exitPromise_();
  this.api_.sendPython(code);
  return result;
};


/**
 * @param {!string} cmd
 * @param {Array<string>} args
 * @export
 */
cwc.mode.aiy.Process.prototype.runSudo = function(cmd, args) {
  const result = this.exitPromise_();
  this.api_.sendSudo(cmd, args);
  return result;
};


/**
 * @export
 */
cwc.mode.aiy.Process.prototype.terminate = function() {
  this.api_.sendSignal(2);
};


/**
 * @return {goog.events.EventTarget}
 */
cwc.mode.aiy.Connection.prototype.getEventHandler = function() {
  return this.api_.getEventHandler();
};
