/**
 * Audit-Ready PR Reviewer
 * Reviews pull requests for compliance regressions
 */

import { execSync } from 'child_process';

// Thin GitHub API wrapper using the `gh` CLI instead of @octokit/rest
const ghApi = {
  getPR(repo, prNumber) {
    const out = execSync(`gh pr view ${prNumber} --repo ${repo} --json number,title,url,headRefOid`, { encoding: 'utf8' });
    const d = JSON.parse(out);
    return { number: d.number, title: d.title, html_url: d.url, head: { sha: d.headRefOid } };
  },
  getPRFiles(repo, prNumber) {
    const out = execSync(`gh pr diff ${prNumber} --repo ${repo} --name-only`, { encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean).map(f => ({ filename: f, status: 'modified', patch: null }));
  },
  getPRDiff(repo, prNumber) {
    return execSync(`gh pr diff ${prNumber} --repo ${repo}`, { encoding: 'utf8' });
  }
};

const COMPLIANCE_CHECKS = {
  privilege_escalation: {
    patterns: [
      /AdministratorAccess/i,
      /\*.*\*/,
      /"Action":\s*"\*"/,
      /full.*access/i
    ],
    frameworks: {
      SOC2: 'CC6.1',
      ISO27001: 'A.9.2.3',
      NIST80053: 'AC-6'
    },
    severity: 'high',
    message: 'This change introduces overly permissive access, violating the Least Privilege principle.'
  },
  missing_encryption: {
    patterns: [
      /storage_encrypted\s*=\s*false/i,
      /encrypted\s*=\s*false/i,
      /encryption.*disabled/i
    ],
    frameworks: {
      SOC2: 'CC7.2',
      ISO27001: 'A.10.1.1',
      NIST80053: 'SC-28'
    },
    severity: 'high',
    message: 'This change disables encryption, which violates data protection requirements.'
  },
  missing_tags: {
    patterns: [
      /tags\s*=\s*\{\}/,
      /tags\s*=\s*null/,
      /#.*missing.*tag/i
    ],
    frameworks: {
      SOC2: 'CC7.1',
      ISO27001: 'A.8.2.1'
    },
    severity: 'medium',
    message: 'This change creates resources without required tags for governance and compliance tracking.'
  },
  public_access: {
    patterns: [
      /public_access_block\s*=\s*null/i,
      /public.*true/i,
      /publicly_accessible\s*=\s*true/i
    ],
    frameworks: {
      SOC2: 'CC7.2',
      ISO27001: 'A.13.1.1',
      NIST80053: 'AC-4'
    },
    severity: 'critical',
    message: 'This change exposes resources to public access, creating a significant security risk.'
  }
};

export async function reviewPR(repo, prNumber, framework = 'SOC2', githubToken) {
  const pr = ghApi.getPR(repo, prNumber);

  // Get full diff and parse per-file patches
  let diff = '';
  try { diff = ghApi.getPRDiff(repo, prNumber); } catch { /* gh not authed or no diff */ }

  const filePatches = {};
  let currentFile = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const m = line.match(/b\/(.+)$/);
      if (m) { currentFile = m[1]; filePatches[currentFile] = []; }
    } else if (currentFile) {
      filePatches[currentFile].push(line);
    }
  }

  const files = ghApi.getPRFiles(repo, prNumber);
  const issues = [];

  for (const file of files) {
    if (file.status === 'removed') continue;
    const patchLines = filePatches[file.filename] || [];
    const content = patchLines.join('\n');
    const fileIssues = analyzeFile(file.filename, content, framework);
    issues.push(...fileIssues);
  }

  const comments = generateComments(issues, framework);

  return {
    pr: { number: prNumber, title: pr.title, url: pr.html_url },
    issues,
    comments,
    summary: {
      total: issues.length,
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length
    }
  };
}

function analyzeFile(filename, content, framework) {
  const issues = [];
  const lines = content.split('\n');

  for (const [checkName, check] of Object.entries(COMPLIANCE_CHECKS)) {
    const controlId = check.frameworks[framework];
    if (!controlId) continue;

    for (const pattern of check.patterns) {
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          // Check if this is an addition (starts with +)
          const isAddition = line.startsWith('+') || !line.startsWith('-');
          
          if (isAddition) {
            issues.push({
              check: checkName,
              file: filename,
              line: index + 1,
              content: line.trim(),
              severity: check.severity,
              control: controlId,
              framework,
              message: check.message
            });
          }
        }
      });
    }
  }

  return issues;
}

function generateComments(issues, framework) {
  const comments = [];

  for (const issue of issues) {
    const emoji = {
      critical: '🚨',
      high: '⚠️',
      medium: '📝'
    }[issue.severity] || 'ℹ️';

    const comment = {
      path: issue.file,
      line: issue.line,
      body: `${emoji} **Compliance Warning: ${framework} ${issue.control}**\n\n` +
            `${issue.message}\n\n` +
            `**Issue:** Line ${issue.line} in \`${issue.file}\`\n` +
            `\`\`\`\n${issue.content}\n\`\`\`\n\n` +
            `**Control Reference:** ${framework} ${issue.control}\n\n` +
            `**Suggested Fix:**\n` +
            generateSuggestion(issue.check) +
            `\n---\n` +
            `*This review was generated by the GRC Engineering Plugin*`
    };

    comments.push(comment);
  }

  return comments;
}

function generateSuggestion(checkName) {
  const suggestions = {
    privilege_escalation: `\`\`\`hcl
resource "aws_iam_role" "app_role" {
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject"
      ]
      Resource = "arn:aws:s3:::my-bucket/*"
    }]
  })
}
\`\`\`
Use least privilege: only grant the minimum permissions required.`,
    missing_encryption: `\`\`\`hcl
resource "aws_db_instance" "example" {
  storage_encrypted = true
  kms_key_id        = aws_kms_key.example.arn
}
\`\`\`
Enable encryption at rest for all data storage.`,
    missing_tags: `\`\`\`hcl
resource "aws_s3_bucket" "example" {
  tags = {
    Department = "Engineering"
    Environment = "Production"
    Compliance = "SOC2"
  }
}
\`\`\`
Add required tags for governance and compliance tracking.`,
    public_access: `\`\`\`hcl
resource "aws_s3_bucket_public_access_block" "example" {
  bucket = aws_s3_bucket.example.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
\`\`\`
Block public access to prevent unauthorized exposure.`
  };

  return suggestions[checkName] || 'Please review and ensure compliance with the control requirements.';
}

