---
'@agentkitai/formbridge-mcp-server': patch
'@agentkitai/formbridge-create': patch
'@agentkitai/formbridge-form-renderer': patch
'@agentkitai/formbridge-schema-normalizer': patch
'@agentkitai/formbridge-shared': patch
'@agentkitai/formbridge-templates': patch
---

Security and dependency updates: fix fast-uri high-severity audit advisory
(GHSA-4c8g-83qw-93j6 / GHSA-v2hh-gcrm-f6hx), patch OpenSSL CVE-2026-45447 in
the production Docker image, move base images to node 25-alpine, and refresh
infra/tooling dependencies (aws-cdk 2.1133, aws-cdk-lib 2.262, constructs
10.7, setup-node/setup-python action majors).
