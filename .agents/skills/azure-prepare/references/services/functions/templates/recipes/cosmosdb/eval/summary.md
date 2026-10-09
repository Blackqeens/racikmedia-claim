# Eval Summary

## Coverage Status

| Language   | Manifest Templates | Eval                | Status                 |
| ---------- | ------------------ | ------------------- | ---------------------- |
| Python     | 1 (Bicep)          | [✅](python.md)     | ✅ Verified            |
| TypeScript | 1 (Bicep)          | [✅](typescript.md) | ✅ Verified            |
| C# (.NET)  | 1 (Bicep)          | —                   | 📋 AZD template exists |
| Java       | 3 (Bicep)          | —                   | 📋 AZD template exists |
| JavaScript | —                  | —                   | ⚠️ No AZD template     |
| PowerShell | —                  | —                   | ⚠️ No AZD template     |

> ⚠️ **Eval cost note:** Each language eval requires ~5 min of agent runtime. Python is verified end-to-end; other languages confirmed in [manifest](https://cdn.functions.azure.com/public/templates-manifest/manifest.json). JavaScript and PowerShell have no Cosmos DB AZD template. Multi-language eval expansion tracked as follow-up.

## MCP Tool Validation

| Test                     | Status  | Details                                                                 |
| ------------------------ | ------- | ----------------------------------------------------------------------- |
| `functions_template_get` | ✅ PASS | 2 calls via `azure-functions` MCP tool                                  |
| Template Discovery       | ✅ PASS | Cosmos templates found via resource filter                              |
| IaC Included             | ✅ PASS | Cosmos Bicep module + RBAC in projectFiles                              |
| E2E Agent Test           | ✅ PASS | 2 `azure-functions` calls per language, templates retrieved and applied |

## Results

| Test                  | Python                      | TypeScript                      |
| --------------------- | --------------------------- | ------------------------------- |
| Health                | ✅                          | ✅                              |
| Trigger fires         | ✅                          | ✅                              |
| Change detected       | ✅                          | ✅                              |
| Code Indicator        | ✅ `cosmos_db_trigger`      | ✅ `app.cosmosDB`               |
| Extra Indicator (IaC) | ✅ `Microsoft.DocumentDB`   | ✅ `Microsoft.DocumentDB`       |
| Template Scaffolded   | `cosmos-trigger-python-azd` | `cosmos-trigger-typescript-azd` |

## Notes

- Templates retrieved via `functions_template_get(language: "<language>", template: "<template-name>")` MCP tool
- Cosmos DB requires dual RBAC: Azure control plane + SQL data plane
- See README for RBAC troubleshooting

## Test Date

2026-04-22
