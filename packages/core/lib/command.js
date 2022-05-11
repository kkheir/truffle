const TaskError = require("./errors/taskerror");
const { bundled, core } = require("../lib/version").info();
const OS = require("os");
const analytics = require("../lib/services/analytics");
const { extractFlags } = require("./utils/utils"); // Contains utility methods
const commandOptions = require("./command-options");
const debugModule = require("debug");
const debug = debugModule("core:command:run");

const getYargs = commands => {
  let args = require("yargs/yargs")();

  Object.keys(commands).forEach(command => {
    args = args.command(commands[command].meta);
  });
  return args;
};

const parseInput = (inputStrings, noAliases, yargs, commands) => {
  const argv = yargs.parse(inputStrings);

  if (argv._.length === 0) {
    throw new TaskError(
      "Cannot find command based on input: " + JSON.stringify(inputStrings)
    );
  }

  const firstInputString = argv._[0];
  let chosenCommand = null;

  // If the command wasn't specified directly, go through a process
  // for inferring the command.
  if (commands[firstInputString]) {
    chosenCommand = firstInputString;
  } else if (noAliases !== true) {
    let currentLength = 1;
    const availableCommandNames = Object.keys(commands);

    // Loop through each letter of the input until we find a command
    // that uniquely matches.
    while (currentLength <= firstInputString.length) {
      // Gather all possible commands that match with the current length
      const possibleCommands = availableCommandNames.filter(possibleCommand => {
        return (
          possibleCommand.substring(0, currentLength) ===
          firstInputString.substring(0, currentLength)
        );
      });

      // Did we find only one command that matches? If so, use that one.
      if (possibleCommands.length === 1) {
        chosenCommand = possibleCommands[0];
        break;
      }

      currentLength += 1;
    }
  }

  if (chosenCommand == null) {
    throw new TaskError(
      "Cannot find command based on input: " + JSON.stringify(inputStrings)
    );
  }

  const command = commands[chosenCommand];

  return {
    name: chosenCommand,
    argv,
    command
  };
};

const runCommand = async function (command, inputStrings, options) {
  try {
    // migrate Truffle data to the new location if necessary
    const configMigration = require("./config-migration");
    await configMigration.migrateTruffleDataIfNecessary();
  } catch (error) {
    debug("Truffle data migration failed: %o", error);
  }

  const argv = command.argv;

  // Remove the task name itself.
  if (argv._) argv._.shift();

  // We don't need this.
  delete argv["$0"];

  // Some options might throw if options is a Config object. If so, let's ignore those options.
  const clone = {};
  Object.keys(options).forEach(key => {
    try {
      clone[key] = options[key];
    } catch (e) {
      // Do nothing with values that throw.
    }
  });

  // while in `console` & `develop`, input is passed as a string, not as an array
  if (!Array.isArray(inputStrings)) inputStrings = inputStrings.split(" ");
  // Method `extractFlags(args)` : Extracts the `--option` flags from arguments
  const inputOptions = extractFlags(inputStrings);

  //adding allowed global options as enumerated in each command
  const allowedGlobalOptions = command.command.meta.help.allowedGlobalOptions
    .filter(tag => tag in commandOptions)
    .map(tag => commandOptions[tag]);

  const allValidOptions = [
    ...command.command.meta.help.options,
    ...allowedGlobalOptions
  ];

  const validOptions = allValidOptions.reduce((a, item) => {
    // we split the options off from the arguments
    // and then we split to handle options of the form --<something>|-<s>
    let options = item.option.split(" ")[0].split("|");
    return [
      ...a,
      ...options.filter(
        option => option.startsWith("--") || option.startsWith("-")
      )
    ];
  }, []);

  let invalidOptions = inputOptions.filter(opt => !validOptions.includes(opt));

  // TODO: Remove exception for 'truffle run' when plugin options support added.
  if (invalidOptions.length > 0 && command.name !== "run") {
    if (options.logger) {
      const log = options.logger.log || options.logger.debug;
      log(
        "> Warning: possible unsupported (undocumented in help) command line option(s): " +
          invalidOptions
      );
    }
  }

  const newOptions = Object.assign({}, clone, argv);

  analytics.send({
    command: command.name ? command.name : "other",
    args: command.argv._,
    version: bundled || "(unbundled) " + core
  });

  const unhandledRejections = new Map();

  process.on("unhandledRejection", (reason, promise) => {
    unhandledRejections.set(promise, reason);
  });

  process.on("rejectionHandled", promise => {
    unhandledRejections.delete(promise);
  });

  process.on("exit", _ => {
    const log = options.logger
      ? options.logger.log || options.logger.debug
      : console.log;
    if (unhandledRejections.size) {
      log("UnhandledRejections detected");
      unhandledRejections.forEach((reason, promise) => {
        log(promise, reason);
      });
    }
  });

  return await command.command.run(newOptions);
};

const displayGeneralHelp = yargs => {
  yargs
    .usage(
      "Truffle v" +
        (bundled || core) +
        " - a development framework for Ethereum" +
        OS.EOL +
        OS.EOL +
        "Usage: truffle <command> [options]"
    )
    .epilog("See more at http://trufflesuite.com/docs")
    .showHelp();
};

module.exports = {
  runCommand,
  displayGeneralHelp,
  getYargs,
  parseInput
};
