var NodeHelper = require("node_helper");
const Log = require("logger");
const { add, formatISO9075, compareAsc, parseISO } = require("date-fns");
const { RateLimit } = require("async-sema");
const dayjs = require("dayjs");
var utc = require("dayjs/plugin/utc");
var timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

module.exports = NodeHelper.create({
  start: function () {
    Log.info(`${this.name} node_helper started ...`);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "FETCH_DATA") {
      this.fetchList(payload);
    } else if (notification === "COMPLETE_TASK") {
      this.completeTask(payload.taskId, payload.config);
    } else {
      Log.warn(`${this.name} - did not process event: ${notification}`);
    }
  },

  completeTask: function (taskId, config) {
    Log.info(
      `${this.name} - completing task '${taskId}'`
    );

    // copy context to be available inside callbacks
    const self = this;

    var patchUrl = `https://todo.entropy159.workers.dev/api/simple/?user=${config.user}`;

    const updateBody = {
      taskName: taskId
    };

    const request = {
      method: "PATCH",
      body: JSON.stringify(updateBody),
      headers: {
        "Content-Type": "application/json"
      }
    };

    fetch(patchUrl, request)
      .then(self.checkFetchStatus)
      .then((response) => response.json())
      .then(self.checkBodyError)
      .then((responseJson) => {
        self.sendSocketNotification(
          `TASK_COMPLETED_${config.id}`,
          responseJson
        );
      })
      .catch((error) => {
        Log.error(`[MMM-MicrosoftToDo]: completeTask: ${patchUrl}`);
        self.logError(error);
      });
  },

  fetchList: function (config) {
    const self = this;

    var getListUrl = `https://todo.entropy159.workers.dev/api/simple/?user=${config.user}&date=${dayjs.tz.guess()}`;
    fetch(getListUrl)
      .then(self.checkFetchStatus)
      .then((response) => response.json())
      .then(self.checkBodyError)
      .then((responseData) => {
        self.getTasks(config, responseData);
      })
      .catch((error) => {
        Log.error(`[MMM-MicrosoftToDo]: fetchList ${getListUrl}`);
        self.logError(error);
      });
  },
  getTasks: function (config, data) {
    const self = this;
    Log.debug(`${this.name} - received data ${data}`);

    const limit = RateLimit(2);
    limit();
    self.sendSocketNotification(`DATA_FETCHED_${config.id}`, data);
  },
  taskSortCompare: function (firstTask, secondTask) {
    if (firstTask.parsedDate === undefined) {
      return 1;
    }
    if (secondTask.parsedDate === undefined) {
      return -1;
    }
    return compareAsc(firstTask.parsedDate, secondTask.parsedDate);
  },

  checkFetchStatus: function (response) {
    if (response.ok) {
      return response;
    } else {
      Log.error(response);
      throw Error(
        `checkFetchStatus failed with status '${response.statusText
        }' ${JSON.stringify(response)}`
      );
    }
  },
  checkBodyError: function (json) {
    if (json && json.error) {
      Log.error(json);
      throw Error(
        `checkBodyError failed with status '${json.error}' ${JSON.stringify(
          json
        )}`
      );
    }
    return json;
  },
  logError: function (error) {
    Log.error(`[MMM-MicrosoftToDo]: ${error}`);
  },
  logErrorObject: function (errorObject) {
    Log.error(`[MMM-MicrosoftToDo]: ${JSON.stringify(errorObject)}`);
  }
});
