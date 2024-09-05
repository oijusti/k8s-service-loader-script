/**
 * K8s Service Loader Script
 *
 * @version 0.0.2
 * @date 2024-08-30
 * @license MIT
 * @repository https://github.com/oijusti/k8s-service-loader-script
 * @description This script lists Kubernetes services by fetching pod details
 *   using kubectl and allows the user to forward ports for a selected service.
 *
 * @usage
 *   Basic Usage: node ./k8s-service-loader-script.js
 *   With Namespace: node ./k8s-service-loader-script.js --namespace <NAMESPACE>
 */

const metadata = {
  version: "0.0.2",
  date: "2024-08-30",
  license: "MIT",
  repository: "https://github.com/oijusti/k8s-service-loader-script",
};

const { exec, spawn } = require("child_process");
const readline = require("readline");
const EventEmitter = require("events");

class DataEmitter extends EventEmitter {}
const dataEmitter = new DataEmitter();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const spinner = new Spinner();

const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const main = async () => {
  print(c.yellow, "☸️  K8s Service Loader Script");
  print(c.cyan, metadata.repository);
  print(c.cyan, `Version: ${metadata.version}`);
  print(c.cyan, "Usage:");
  print(c.cyan, "  node ./k8s-service-loader-script.js");
  print(
    c.cyan,
    "  node ./k8s-service-loader-script.js --namespace <NAMESPACE>"
  );

  let namespace = getArgValue("--namespace");

  const getPodsCommand = namespace
    ? `kubectl get pods --namespace ${namespace}`
    : "kubectl get pods --all-namespaces";

  print(c.green, `\n> ${getPodsCommand}`);
  spinner.start("Loading services");

  try {
    const podsData = await execPromise(getPodsCommand);
    spinner.stop();

    const servicesMap = getServicesMap(podsData, namespace);
    const servicesList = Array.from(servicesMap.keys()).sort();

    if (servicesList.length === 0) {
      print(c.magenta, "No services found.");
      rl.close();
      return;
    }

    print(c.magenta, "\nServices found:");
    servicesList.forEach((service, index) => {
      print(c.green, `[${index + 1}] ${service}`);
    });

    const serviceAnswer = await prompt(
      colorText(c.yellow, "Select a service by typing a number: ")
    );
    const selectedIndex = parseInt(serviceAnswer) - 1;

    if (
      isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= servicesList.length
    ) {
      console.error(
        "Invalid selection. Please run the script again and choose a valid number."
      );
      rl.close();
      return;
    }

    const selectedService = servicesList[selectedIndex];
    print(c.cyan, `You selected: ${selectedService}`);

    print(c.magenta, "\nEnvironments:");
    print(c.green, "[1] dev");
    print(c.green, "[2] qa");
    print(c.green, "[3] stg");

    const envAnswer = await prompt(
      colorText(
        c.yellow,
        "Select an environment by typing a number (default: 1): "
      )
    );
    const envChoice = parseInt(envAnswer) || 1;

    let environment;
    if (envChoice === 1) {
      environment = "dev";
    } else if (envChoice === 2) {
      environment = "qa";
    } else if (envChoice === 3) {
      environment = "stg";
    } else {
      console.error(
        "Invalid selection. Please run the script again and choose either '1', '2', or '3'."
      );
      rl.close();
      return;
    }

    const serviceDetails = servicesMap.get(selectedService)[environment];

    if (!serviceDetails) {
      console.error(
        `The selected environment "${environment}" does not exist for the service "${selectedService}". Please run the script again and choose a valid environment.`
      );
      rl.close();
      return;
    }

    const serviceId = serviceDetails.id;
    namespace = namespace ?? serviceDetails.namespace;

    const localPortAnswer = await prompt(
      colorText(
        c.yellow,
        "\nEnter the local port to run the service (default: 3000): "
      )
    );
    const localPort = localPortAnswer || "3000";

    const getServicePortCommand = `kubectl get service --namespace ${namespace} ${environment}-${namespace}-${selectedService} -o jsonpath={.spec.ports[*].port}`;
    print(c.green, `\n> ${getServicePortCommand}`);

    spinner.start("Detecting port on the Kubernetes service");
    const servicePortDetected = await execPromise(getServicePortCommand);
    spinner.stop();
    print(c.cyan, `Port detected: ${servicePortDetected}\n`);

    const servicePortAnswer = await prompt(
      colorText(
        c.yellow,
        `Enter the destination port on the Kubernetes service. Try using port 3000 if the detected port fails (default: ${servicePortDetected}): `
      )
    );
    const servicePort = servicePortAnswer || `${servicePortDetected}`;

    const portForwardCommand = `kubectl port-forward --namespace ${namespace} ${environment}-${namespace}-${selectedService}-${serviceId} ${localPort}:${servicePort}`;
    const logsCommand = `kubectl logs --namespace ${namespace} ${environment}-${namespace}-${selectedService}-${serviceId} -f`;

    print(c.green, `\n> ${portForwardCommand}`);
    spinner.start("Initializing port forwarding");

    const portForwardProcess = spawn(
      "kubectl",
      portForwardCommand.split(" ").slice(1)
    );

    let portForwardFirstTime = true;

    portForwardProcess.stdout.on("data", async (data) => {
      if (portForwardFirstTime) spinner.stop();

      print(c.green, `\n${data}`);
      print(c.magenta, `Service available at: http://localhost:${localPort}`);

      if (!portForwardFirstTime) return;
      portForwardFirstTime = false;

      dataEmitter.emit("portForwardDataReceived", logsCommand);
    });

    portForwardProcess.stderr.on("data", (data) => {
      console.error(`\n${data}`);
    });

    portForwardProcess.on("close", (code) => {
      print(c.cyan, `\nPort-forward process exited with code ${code}`);
    });
  } catch (error) {
    spinner.stop();
    console.error(`${error.message}`);
    rl.close();
  }
};

async function handleLogsProcess(logsCommand) {
  await sleep(500);

  const logsAnswer = await prompt(
    colorText(
      c.yellow,
      "\nWould you like to see the logs in real time? (Y/n): "
    )
  );
  const logsChoice = logsAnswer.toLowerCase() || "y";

  if (logsChoice === "y" || logsChoice === "yes") {
    print(c.green, `\n> ${logsCommand}`);
    spinner.start("Fetching logs for the pod");

    const logsProcess = spawn("kubectl", logsCommand.split(" ").slice(1));

    let logsFirstTime = true;

    logsProcess.stdout.on("data", (data) => {
      if (logsFirstTime) spinner.stop();
      logsFirstTime = false;
      print(c.reset, `${data}`);
    });

    logsProcess.stderr.on("data", (data) => {
      console.error(`${data}`);
    });

    logsProcess.on("close", (code) => {
      print(c.cyan, `Logs process exited with code ${code}`);
    });
  } else {
    print(c.cyan, "Skipping logs.");
  }

  rl.close();
}

dataEmitter.on("portForwardDataReceived", handleLogsProcess);

main();

/**
 * Helpers
 */

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else if (stderr) {
        reject(new Error(stderr));
      } else {
        resolve(stdout);
      }
    });
  });
}

function getServicesMap(podsData, namespace) {
  const servicesMap = new Map();
  const lines = podsData.trim().split("\n");

  // Get headers to find indices
  const headers = lines[0].split(/\s+/);
  const namespaceIndex = headers.indexOf("NAMESPACE");
  const nameIndex = headers.indexOf("NAME");

  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(/\s+/);
    const namespaceColumn = namespace ?? columns[namespaceIndex];
    const nameColumn = columns[nameIndex];

    // Only include services that start with "dev-", "qa-" or "stg-"
    let envPrefix = "";
    if (nameColumn.startsWith("dev-")) {
      envPrefix = "dev";
    } else if (nameColumn.startsWith("qa-")) {
      envPrefix = "qa";
    } else if (nameColumn.startsWith("stg-")) {
      envPrefix = "stg";
    } else {
      continue; // Skip this service as it does not start with "dev-", "qa-" or "stg-"
    }

    let modifiedName = nameColumn.replace(/^(dev-|qa-|stg-)/, "");

    // Remove namespace part found in the namespace column
    if (namespaceColumn) {
      modifiedName = modifiedName.replace(
        new RegExp(`^${namespaceColumn}-`, "g"),
        ""
      );
    }

    // Split the remaining parts by "-" and extract the last two parts as the ID
    const parts = modifiedName.split("-");
    if (parts.length > 2) {
      const serviceName = parts.slice(0, -2).join("-");
      const serviceId = parts.slice(-2).join("-");
      if (!servicesMap.has(serviceName)) {
        servicesMap.set(serviceName, {});
      }
      servicesMap.get(serviceName)[envPrefix] = {
        id: serviceId,
        namespace: namespaceColumn,
      };
    }
  }
  return servicesMap;
}

function getArgValue(flag) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) {
      return args[i + 1];
    }
  }
  return null;
}

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function colorText(colorCode, text) {
  const reset = "\x1b[0m";
  return `${colorCode}${text}${reset}`;
}

function print(colorCode, text) {
  return console.log(colorText(colorCode, text));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Spinner() {
  const spinnerChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let index = 0;
  let intervalId = null;
  let message = "";

  return {
    start(newMessage) {
      if (intervalId) return; // Spinner is already running

      message = newMessage;
      process.stdout.write(`${message}...`); // Write the message first

      intervalId = setInterval(() => {
        process.stdout.write(`\r${message}...${spinnerChars[index]}`);
        index = (index + 1) % spinnerChars.length;
      }, 100); // Adjust the speed by changing the interval (in milliseconds)
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        process.stdout.write(`\r${message}...done.\n`); // Overwrite the spinner with "done."
      }
    },
  };
}
