export function buildRelationships(issues, prs) {
  const relationships = {};
  const ensure = (key) => (relationships[key] ||= { closing: [], closedBy: [] });
  const repository = issues[0]?.key.split(":")[0] || prs[0]?.key.split(":")[0];
  const refKey = (type, number) => `${repository}:${type}#${number}`;
  const addIssue = (issue) => {
    const closingPrs = issue.closedByPullRequestsReferences.nodes;
    ensure(issue.key).closedBy = closingPrs;
    closingPrs.forEach((pr) => ensure(refKey("pr", pr.number)).closing.push(issue));
  };
  const addPr = (pr) => {
    const closingIssues = pr.closingIssuesReferences.nodes;
    ensure(pr.key).closing = closingIssues;
    closingIssues.forEach((issue) => ensure(refKey("issue", issue.number)).closedBy.push(pr));
  };
  issues.forEach(addIssue);
  prs.forEach(addPr);
  return relationships;
}
