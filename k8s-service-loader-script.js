/**
 * K8s Service Loader Script
 *
 * @version 0.0.1
 * @date 2024-08-30
 * @license MIT
 * @repository https://github.com/oijusti/k8s-service-loader-script
 * @description This script lists Kubernetes services by fetching pod details
 *   using kubectl and allows the user to forward ports for a selected service.
 */

const { exec, spawn } = require("child_process");
const readline = require("readline");

const metadata = {
  version: "0.0.1",
};

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

console.log(`${colors.fgCyan}K8s Service Loader Script${colors.reset}`);
console.log(`${colors.fgYellow}Version: ${metadata.version}${colors.reset}`);

console.log(`${colors.fgGreen}Loading services, please wait...${colors.reset}`);

exec("kubectl get pods --all-namespaces", (error, stdout, stderr) => {
  if (error) {
    console.error(
      `${colors.fgRed}Error executing kubectl: ${error.message}${colors.reset}`
    );
    return;
  }

  if (stderr) {
    console.error(`${colors.fgRed}stderr: ${stderr}${colors.reset}`);
    return;
  }

  const lines = stdout.trim().split("\n");
  const servicesMap = new Map();

  // Get headers to find indices
  const headers = lines[0].split(/\s+/);
  const namespaceIndex = headers.indexOf("NAMESPACE");
  const nameIndex = headers.indexOf("NAME");

  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(/\s+/);
    const namespaceColumn = columns[namespaceIndex];
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

  // Convert services to a sorted array
  const serviceList = Array.from(servicesMap.keys()).sort();

  console.log(`${colors.fgCyan}Services found:${colors.reset}`);
  serviceList.forEach((service, index) => {
    console.log(`${colors.fgGreen}[${index + 1}] ${service}${colors.reset}`);
  });

  if (serviceList.length === 0) {
    console.log(`${colors.fgMagenta}No services found.${colors.reset}`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(
    `${colors.fgYellow}Please select a service by typing a number: ${colors.reset}`,
    (answer) => {
      const selectedIndex = parseInt(answer) - 1;

      if (selectedIndex >= 0 && selectedIndex < serviceList.length) {
        const selectedService = serviceList[selectedIndex];
        console.log(
          `${colors.fgCyan}You selected: ${selectedService}${colors.reset}`
        );

        console.log(`${colors.fgYellow}Select an environment:${colors.reset}`);
        console.log(`${colors.fgGreen}[1] dev${colors.reset}`);
        console.log(`${colors.fgGreen}[2] qa${colors.reset}`);
        console.log(`${colors.fgGreen}[3] stg${colors.reset}`);

        rl.question(
          `${colors.fgYellow}Enter your choice (1, 2, or 3): ${colors.reset}`,
          (envChoice) => {
            let environment;
            if (envChoice === "1") {
              environment = "dev";
            } else if (envChoice === "2") {
              environment = "qa";
            } else if (envChoice === "3") {
              environment = "stg";
            } else {
              console.log(
                `${colors.fgRed}Invalid selection. Please run the script again and choose either "1", "2", or "3".${colors.reset}`
              );
              rl.close();
              return;
            }

            const serviceDetails =
              servicesMap.get(selectedService)[environment];

            // Check if service details exist for the chosen environment
            if (!serviceDetails) {
              console.log(
                `${colors.fgRed}The selected environment "${environment}" does not exist for the service "${selectedService}". Please run the script again and choose a valid environment.${colors.reset}`
              );
              rl.close();
              return;
            }

            const serviceId = serviceDetails.id;
            const namespace = serviceDetails.namespace;

            rl.question(
              `${colors.fgYellow}Enter the local port to run the service (default is 3000): ${colors.reset}`,
              (portInput) => {
                const localPort = portInput.trim() || "3000";

                const portForwardCommand = `kubectl port-forward --namespace ${namespace} ${environment}-${namespace}-${selectedService}-${serviceId} ${localPort}:3000`;

                console.log(
                  `${colors.fgCyan}Generated command:${colors.reset}`
                );
                console.log(
                  `${colors.fgGreen}${portForwardCommand}${colors.reset}`
                );

                console.log(
                  `${colors.fgGreen}Running the port-forward command, please wait...${colors.reset}`
                );

                // Execute the port-forward command using spawn
                const child = spawn("kubectl", [
                  "port-forward",
                  "--namespace",
                  namespace,
                  `${environment}-${namespace}-${selectedService}-${serviceId}`,
                  `${localPort}:3000`,
                ]);

                // Stream the output of the command
                child.stdout.on("data", (data) => {
                  console.log(
                    `${colors.fgGreen}stdout: ${data}${colors.reset}`
                  );
                  console.log(
                    `${colors.fgMagenta}Service available at: http://localhost:${localPort}${colors.reset}`
                  );
                });

                child.stderr.on("data", (data) => {
                  console.error(
                    `${colors.fgRed}stderr: ${data}${colors.reset}`
                  );
                });

                child.on("close", (code) => {
                  console.log(
                    `${colors.fgCyan}Child process exited with code ${code}${colors.reset}`
                  );
                });

                rl.close();
              }
            );
          }
        );
      } else {
        console.log(
          `${colors.fgRed}Invalid selection. Please run the script again and choose a valid number.${colors.reset}`
        );
        rl.close();
      }
    }
  );
});
