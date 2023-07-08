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
          efficiency = line.split(':')[1].trim() || 'undefiened';
      } else if (line.includes('wastedBytes:')) {
          wastedBytes = line.split(':')[1].trim() || 'undefiened';
      } else if (line.includes('userWastedPercent:')) {
          userWastedPercent = line.split(':')[1].trim() || 'undefiened';
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
  const tableRowsToShow = 5
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

module.exports = async ({
  github,
  context,
  exec,
  core
}) => {
  let commitSHA = context.sha;
  let imageSize = await captureExecOutput(exec,'docker', ['image', 'list', '--format', '{{.Size}}', 'smoketest-image']);
  // let imageLayers = await captureExecOutput(exec,'docker', ['image', 'history' ,'-H'  ,'--format','table {{.CreatedBy}} \\t\\t {{.Size}}' ,'smoketest-image']);
  let diveAnalysis = await captureExecOutput(exec,'docker', ['run', '--rm', '-e', 'CI=true', '-v', `${core.getInput('workspace', { required: true })}/.dive-ci:/tmp/.dive-ci`, '-v',
      '/var/run/docker.sock:/var/run/docker.sock', 'wagoodman/dive:latest', '--ci-config', '/tmp/.dive-ci', 'smoketest-image'
  ], true);
  console.log(commitSHA);
  console.log(imageSize);
  // console.log(imageLayers);
  // console.log(diveAnalysis);
  // remove the ANSI color codes
  let [efficiency, wastedBytes, userWastedPercent, mostInefficientFiles, detailsTable] = parseDiveOutput(diveAnalysis);
  let githubMessage = `# ${core.getInput('image-type', { required: true })} image analysis based on ${commitSHA}
## Summary
\`Total Size\`:  ${imageSize}
\`Efficiency\`: ${efficiency}
\`wastedBytes\`: ${wastedBytes}
\`userWastedPercent\`: ${userWastedPercent}

----------------------------------------------------------
## Inefficient Files:
${mostInefficientFiles}

<details>

<summary>Full output </summary>

${detailsTable}

</details>
`;
  github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: githubMessage
  });

  return "Success"
}
// TODO: add dive config file
// TODO: add a seperate script
// TODO: add artifact upoload 
// TODO: add the result section and custom annotation
// TODO: mark old messages as outdated