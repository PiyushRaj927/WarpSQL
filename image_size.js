async function saveMetricsToFile(metrics, fs) {
  const filePath = "image-metrics.json";
  const jsonData = JSON.stringify(metrics, null, 2);

  try {
    await fs.promises.writeFile(filePath, jsonData);
    console.log(`Metrics saved to ${filePath}`);
  } catch (error) {
    console.error(`Error saving metrics to ${filePath}: ${error}`);
  }
}

async function readMetricsFromFile(fs) {
  const filePath = "image-metrics.json";
  try {
    const jsonData = await fs.promises.readFile(filePath);
    const metrics = JSON.parse(jsonData);
    return metrics;
  } catch (error) {
    console.error(`Error reading metrics from ${filePath}: ${error}`);
    return null;
  }
}

function parseSizeToBytes(value, unit) {
  let bytes;

  switch (unit) {
    case "KB":
      bytes = value * 1024;
      break;
    case "MB":
      bytes = value * 1024 * 1024;
      break;
    case "GB":
      bytes = value * 1024 * 1024 * 1024;
      break;
    default:
      throw new Error("Invalid size unit");
  }

  return bytes;
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    "Bytes",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
    "PiB",
    "EiB",
    "ZiB",
    "YiB",
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

async function captureExecOutput(
  exec,
  command,
  arguments,
  ignoreExitCode = false
) {
  let myOutput = "";
  let myError = "";

  const options = {};
  options.listeners = {
    stdout: (data) => {
      myOutput += data.toString();
    },
    stderr: (data) => {
      myError += data.toString();
    },
  };
  if (ignoreExitCode) {
    options.ignoreReturnCode = true;
  }
  await exec.exec(command, arguments, options);
  console.log(myOutput);
  return myOutput;
}

function calculatePercentageChange(currentValue, previousValue) {
  if (!previousValue || previousValue === 0) {
    return null;
  }

  const percentageChange =
    ((currentValue - previousValue) / previousValue) * 100;
  const colorIndicator =
    percentageChange > 0 ? ":small_red_triangle:" : ":small_red_triangle_down:";
  console.log(percentageChange);
  console.log(percentageChange.toFixed(2));
  const formattedChange = `[${percentageChange.toFixed(
    2
  )} %  ${colorIndicator}]`;
  return formattedChange;
}

module.exports = async ({ github, context, exec, core, fs }) => {
  let commitSHA = context.sha;
  let imageSize = await captureExecOutput(exec, "docker", [
    "image",
    "list",
    "--format",
    "{{.Size}}",
    "smoketest-image",
  ]);
  imageSizeInBytes = parseSizeToBytes(
    imageSize.trim().slice(0, -2),
    imageSize.trim().slice(-2)
  );
  let imageLayers = await captureExecOutput(exec, "docker", [
    "image",
    "history",
    "-H",
    "--format",
    "table {{.CreatedBy}} \\t\\t {{.Size}}",
    "smoketest-image",
  ]);
  const imageType = core.getInput("image-type", { required: true });

  const workspace = core.getInput("workspace", { required: true });

  if (context.eventName == "pull_request") {
    const existingMetrics = (await readMetricsFromFile(fs)) || [];
    const metricToCompare =
      existingMetrics[
      existingMetrics.findIndex((metric) => metric.imageId === imageType)
      ];

    let githubMessage = `### :bar_chart: ${imageType} Image Analysis  (Commit: ${commitSHA} )
  #### Summary
  
  - **Current Size:** ${formatBytes(
      imageSizeInBytes
    )} ${calculatePercentageChange(imageSizeInBytes, metricToCompare.imageSize)}
  - **Previous Size :** ${formatBytes(metricToCompare.imageSize)} 
  `;
    github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: githubMessage,
    });
  } else if (context.eventName == "push") {
    const metrics = [
      {
        imageId: imageType,
        imageSize: imageSizeInBytes,
      },
    ];

    await saveMetricsToFile(metrics, fs);
  }
};
