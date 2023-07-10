function parseDiveOutput(imageAnalysis) {
  //remove ansi codes
  let cleanText = imageAnalysis.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  let inefficientFilesSection = false;
  let resultSection = false;
  const tableHeader = 'Count|Wasted Space|File Path\n--|--|--';
  let efficiency, wastedBytes, userWastedPercent;
  let tableRows = [];
  for (const line of cleanText.split('\n')) {
      if (line.includes('efficiency')) {
          efficiency = parseFloat(line.split(':')[1].trim().slice(0,-2)) ;
      } else if (line.includes('wastedBytes:')) {
          wastedBytes = parseInt(line.split(':')[1].trim().split(" ")[0]) ;
      } else if (line.includes('userWastedPercent:')) {
          userWastedPercent = parseFloat(line.split(':')[1].trim().slice(0,-2)) ;
      } else if (line.includes('Inefficient Files:')) {
          inefficientFilesSection = true;
      } else if (inefficientFilesSection) {
          if (!line.startsWith('Count')) {
              tableRows.push(
                  `| ${line.slice(0, 5)} | ${line.slice(7, 19)} | ${line.slice(21)} |`
              )
          }
      }
  }
  const tableRowsToShow = 10
  const detailsTable = [tableHeader, ...tableRows.slice(tableRowsToShow)].join('\n');

  const mostInefficientFiles = [tableHeader, ...tableRows.slice(0, tableRowsToShow)].join('\n');

  // const output = +`efficiency: ${efficiency}\n`
  //               + `wastedBytes: ${wastedBytes}\n`
  //               + `userWastedPercent: ${userWastedPercent}\n`
  //               + 'the below should be in a markdown table\n'
  //               + 'Inefficient Files:\n\n'
  //               +  detailsTable
  //               + '\n\n<details>\n'
  //               + '            <summary>dive analysis </summary>\n\n'
  //               + markdownTable
  //               + '\n\n<details>\n';


  return [efficiency, wastedBytes, userWastedPercent, mostInefficientFiles, detailsTable];
}

async function saveMetricsToFile(metrics,fs) {
    const filePath = '/tmp/image-metrics.json';
    const jsonData = JSON.stringify(metrics, null, 2);
  
    try {
      await fs.promises.writeFile(filePath, jsonData);
      console.log(`Metrics saved to ${filePath}`);
    } catch (error) {
      console.error(`Error saving metrics to ${filePath}: ${error}`);
    }
  }

  async function readMetricsFromFile(fs) {
    const filePath = '/tmp/image-metrics.json';  
    try {
      const jsonData = await fs.promises.readFile(filePath);
      const metrics = JSON.parse(jsonData);
      return metrics;
    } catch (error) {
      console.error(`Error reading metrics from ${filePath}: ${error}`);
      return null;
    }
  }

  function parseSizeToBytes(value,unit) {
  let bytes;
  
  switch (unit) {
    case 'KB':
      bytes = value * 1024;
      break;
    case 'MB':
      bytes = value * 1024 * 1024;
      break;
    case 'GB':
      bytes = value * 1024 * 1024 * 1024;
      break;
    default:
      throw new Error('Invalid size unit');
  }
  
  return bytes;
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

async function captureExecOutput(exec, command, arguments, ignoreExitCode = false) {
  let myOutput = '';
  let myError = '';

  const options = {};
  options.listeners = {
      stdout: (data) => {
          myOutput += data.toString();
      },
      stderr: (data) => {
          myError += data.toString();
      }
  };
  if (ignoreExitCode) {
      options.ignoreReturnCode = true;
  };
  await exec.exec(command, arguments, options);
  console.log(myOutput);
  return myOutput;
}

function calculatePercentageChange(currentValue, previousValue) {
  if (previousValue === 0) {
    return null;
  }

  const percentageChange = ((currentValue - previousValue) / previousValue) * 100;
  const colorIndicator = percentageChange > 0 ? ':small_red_triangle:' : ':small_red_triangle_down:';
  console.log(percentageChange);
  console.log(percentageChange.toFixed(2));
  const formattedChange = `[${percentageChange.toFixed(2)} %  ${colorIndicator}]`;
  return formattedChange;
}
module.exports = async ({
  github,
  context,
  exec,
  core,
  fs
}) => {
  let commitSHA = context.sha;
  let imageSize = await captureExecOutput(exec,'docker', ['image', 'list', '--format', '{{.Size}}', 'smoketest-image']);
  imageSizeInBytes = parseSizeToBytes(imageSize.trim().slice(0,-2), imageSize.trim().slice(-2))
  let imageLayers = await captureExecOutput(exec,'docker', ['image', 'history' ,'-H'  ,'--format','table {{.CreatedBy}} \\t\\t {{.Size}}' ,'smoketest-image']);
  const imageType = core.getInput('image-type', { required: true });
  // const existingMetrics = await readMetricsFromFile(fs) || [];
  const existingMetrics =  [ {
    imageId: "bitnami",
    imageSize: 7516192768,
    efficiency: 98,
    wastedBytes: 250589999 ,
    userWastedPercent: 5
  }];
  const workspace = core.getInput('workspace', { required: true });
  const metricToCompare = existingMetrics[existingMetrics.findIndex(metric => metric.imageId === imageType)];
  let diveAnalysis = await captureExecOutput(exec,'docker', ['run', '--rm', '-e', 'CI=true', '-v', `${workspace}/.dive-ci:/tmp/.dive-ci`, '-v',
      '/var/run/docker.sock:/var/run/docker.sock', 'wagoodman/dive:latest', '--ci-config', '/tmp/.dive-ci', 'smoketest-image'
  ], true);
  console.log(commitSHA);
  console.log(imageSize);
  // console.log(imageLayers);
  // console.log(diveAnalysis);
  // remove the ANSI color codes
  console.log("fs",fs);
  console.log(metricToCompare);
  console.log(metricToCompare.imageSize);
  console.log(calculatePercentageChange(imageSizeInBytes,metricToCompare.imageSize));
  let [efficiency, wastedBytes, userWastedPercent, mostInefficientFiles, detailsTable] = parseDiveOutput(diveAnalysis);
//   let githubMessage = `### :bar_chart: ${imageType} Image Analysis  (Commit: ${commitSHA} )
// #### Summary

// - **Total Size:** ${formatBytes(imageSizeInBytes)} ${calculatePercentageChange(imageSizeInBytes,metricToCompare.imageSize)}
// - **Efficiency:** ${efficiency} % ${calculatePercentageChange(efficiency,metricToCompare.efficiency)}
// - **Wasted Bytes:** ${formatBytes(wastedBytes)} ${calculatePercentageChange(wastedBytes,metricToCompare.wastedBytes)}
// - **User Wasted Percent:** ${userWastedPercent} % ${calculatePercentageChange(userWastedPercent,metricToCompare.userWastedPercent)}

// #### Inefficient Files:
// ${mostInefficientFiles}`
// // + ` <details>

// // <summary>Full output </summary>

// // ${detailsTable}

// // </details>
// // `
// ;

let githubMessage = `### :bar_chart: ${imageType} Image Analysis  (Commit: ${commitSHA} )
#### Summary

- **Current Size:** ${formatBytes(imageSizeInBytes)} ${calculatePercentageChange(imageSizeInBytes,metricToCompare.imageSize)}
- **Previous Size :** ${formatBytes(metricToCompare.imageSize)} 
`
;

  github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: githubMessage
  });

  const metrics = [{
    imageId: "bitnami",
    imageSize:imageSizeInBytes,
    efficiency: efficiency,
    wastedBytes: wastedBytes,
    userWastedPercent: userWastedPercent,
  }];

  await saveMetricsToFile(metrics,fs);

  return "Success";
}
// TODO: add dive config file [done]
// TODO: add a seperate script [done]
// TODO: add artifact upoload 
// TODO: add the result section and custom annotation
// TODO: mark old messages as outdated [done]