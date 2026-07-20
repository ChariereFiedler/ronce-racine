# Section DG - Data Governance (8 questions)

## Table of contents

- [DG-01 - Data ownership and stewardship](#dg-01--data-ownership-and-stewardship--criticality--should)
- [DG-02 - Data catalog and metadata dictionary](#dg-02--data-catalog-and-metadata-dictionary--criticality--should)
- [DG-03 - Migrations and schema evolution](#dg-03--migrations-and-schema-evolution--criticality--must)
- [DG-04 - Data contracts between producers and consumers](#dg-04--data-contracts-between-producers-and-consumers--criticality--should)
- [DG-05 - Continuous data-quality monitoring](#dg-05--continuous-data-quality-monitoring--criticality--should)
- [DG-06 - Classification and protection of sensitive data](#dg-06--classification-and-protection-of-sensitive-data--criticality--must)
- [DG-07 - Retention policies and data lifecycle](#dg-07--retention-policies-and-data-lifecycle--criticality--must)
- [DG-08 - Data architecture and topology (Data Mesh)](#dg-08--data-architecture-and-topology-data-mesh--criticality--should)

---

### DG-01 - Data ownership and stewardship - Criticality: **SHOULD**

**Analyze:** Documentation of data models, data dictionary, responsibilities

**Verification commands:**
```bash
find docs/ -name "*data*" -o -name "*glossary*" -o -name "*dictionary*" -o -name "*owner*" 2>/dev/null | head -10
grep -ri "data.owner\|data.steward\|responsable.*donnee" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Data owner identified for each domain
- Data catalog (documented schema)
- Shared business glossary
- Documented lineage (where the data comes from, where it goes)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Nobody knows who is responsible for which data. |
| 1 | Implicit data owners (whoever created the table). |
| 2 | Explicit data owners. Documented schema. |
| 3 | Formalized data catalog. Business glossary. Basic lineage. |
| 4 | Automated data catalog. Data contracts between teams. Data-quality SLA. |

---

### DG-02 - Data catalog and metadata dictionary - Criticality: **SHOULD**

**Analyze:** DB constraints, application validations, data-quality monitoring

**Verification commands:**
```bash
grep -ri "constraint\|unique\|not.null\|check\|foreign" . --include="*.sql" --include="*.ts" --include="*.rs" 2>/dev/null | head -10
find . -name "*catalog*" -o -name "*dictionar*" -o -name "*metadata*" 2>/dev/null | grep -v node_modules | head -10
```

**Check:**
- Integrity constraints in the database (FK, unique, not null, check)
- Application validation consistent with the DB schema
- Data-quality monitoring
- Data-anomaly detection

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No constraints. Inconsistent data tolerated. |
| 1 | Basic constraints in the DB (PK, FK). Minimal application validation. |
| 2 | Complete constraints. Validation aligned DB <-> app. |
| 3 | Data-quality monitoring. Anomaly detection. Business rules in the DB. |
| 4 | Data-quality SLA. Automated data testing. Self-healing of known anomalies. |

---

### DG-03 - Migrations and schema evolution - Criticality: **MUST**

**Analyze:** Migration files (SQLx, Prisma, Knex, Flyway, Alembic), migration strategy

**Verification commands:**
```bash
# Migration directories
find . -path "*/migrations/*" -name "*.sql" -o -path "*/migrations/*" -name "*.rs" 2>/dev/null | head -10
ls prisma/migrations/ migrations/ alembic/ db/migrate/ 2>/dev/null
# Migration tool in the dependencies
grep -ri "migration\|migrate\|sqlx" package.json Cargo.toml 2>/dev/null
```

**Check:**
- Versioned and reproducible migrations
- No manual ALTER TABLE in production
- Reversible migrations (or documented forward-only)
- Review of migrations before execution

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No migration system. Manual ALTER TABLEs. |
| 1 | Migration tool in place but used ad hoc. |
| 2 | Versioned migrations. Automated execution. Review before apply. |
| 3 | Reversible migrations. Migration tests. Documented zero-downtime migrations. |
| 4 | Schema drift detection. Migrations tested on a prod copy. Blue-green DB migrations. |

---

### DG-04 - Data contracts between producers and consumers - Criticality: **SHOULD**

**Analyze:** Data contracts, schema registries, data APIs, SLA on data

**Verification commands:**
```bash
grep -ri "data.contract\|schema.registry\|avro\|protobuf\|json.schema" . --include="*.ts" --include="*.rs" --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
find . -name "*.avsc" -o -name "*.proto" -o -name "*schema*" 2>/dev/null | grep -v node_modules | head -10
grep -ri "confluent\|glue.*registry\|schema.*version" . 2>/dev/null | head -5
```

**Check:**
- Formal contracts between data producers and consumers
- Formalized schemas (Avro, Protobuf, JSON Schema)
- SLA on data (freshness, completeness, availability)
- Schema versioning and backward compatibility
- Contract testing in CI/CD

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No contract. Consumers discover the schema from the source. Breaking changes without notice. |
| 1 | Schema documented informally (wiki, README). No SLA or compatibility guarantee. |
| 2 | Formalized schemas (Avro, Protobuf, JSON Schema). Schema registry in place. Versioning defined. |
| 3 | Explicit data contracts with SLA (freshness, completeness). Contract testing in CI/CD. Change notifications. |
| 4 | Data contracts as code versioned in Git. Backward compatibility enforced automatically. SLAs monitored with alerts. Self-service discovery portal. |

---

### DG-05 - Continuous data-quality monitoring - Criticality: **SHOULD**

**Analyze:** Data-quality tools, data tests, alerts on anomalies

**Verification commands:**
```bash
grep -ri "great.expectations\|monte.carlo\|soda\|dbt.test\|elementary\|data.quality" . --include="*.yml" --include="*.yaml" --include="*.py" --include="*.ts" 2>/dev/null | head -10
grep -ri "freshness\|completeness\|accuracy\|consistency\|uniqueness\|validity" . --include="*.yml" --include="*.md" 2>/dev/null | head -10
```

**Check:**
- Quality dimensions measured (freshness, completeness, accuracy, consistency, uniqueness, validity)
- Quality tests defined and run regularly
- Alerts on quality anomalies
- Data-quality dashboard
- Quality SLAs defined

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No monitoring. Quality issues discovered by end users. |
| 1 | Ad-hoc manual checks via SQL queries. No alert. Reactive only. |
| 2 | Quality tests defined (Great Expectations, Soda, dbt tests) for critical datasets. Periodic execution. |
| 3 | Continuous monitoring with automatic alerts. Quality dashboard. Dimensions measured. Quality SLAs defined. |
| 4 | Integrated data-observability platform. ML anomaly detection. Automated root-cause analysis. Auto-remediation for simple cases. |

---

### DG-06 - Classification and protection of sensitive data - Criticality: **MUST**

**Analyze:** Classification policy, automatic PII detection, masking, access controls

**Verification commands:**
```bash
grep -ri "classification\|sensib\|confidential\|restricted\|public\|internal" . --include="*.md" --include="*.yml" 2>/dev/null | head -10
grep -ri "pii.*detect\|data.*masking\|tokeniz\|column.*encrypt" . --include="*.ts" --include="*.rs" --include="*.py" --include="*.yml" 2>/dev/null | head -10
```

**Check:**
- Classification levels defined (public, internal, confidential, restricted)
- PII identified and inventoried
- Automatic PII detection
- Dynamic masking depending on context
- Access controls aligned with the classification

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No classification. No distinction between public and confidential data. PII not identified. |
| 1 | Informal classification of a few datasets. Ad-hoc masking. No automatic PII detection. |
| 2 | Documented classification policy with defined levels. PII identified and inventoried. Masking in place for test environments. |
| 3 | Systematic classification integrated into the catalog. Automatic PII detection. Dynamic masking. Aligned access controls. Regular audits. |
| 4 | Automatic classification via ML. Data masking as a service. Tokenization for real-time streams. Compliance dashboard. Proactive detection of undeclared sensitive data. |

---

### DG-07 - Retention policies and data lifecycle - Criticality: **MUST**

**Analyze:** Lifecycle policy, archiving, irreversible deletion, tiered storage

**Verification commands:**
```bash
grep -ri "lifecycle\|retention\|archiv\|ttl\|expire\|cold.storage\|tiered" . --include="*.ts" --include="*.rs" --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -10
grep -ri "legal.hold\|gel.judiciaire\|retention.as.code" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Retention policy per data category
- Retention durations aligned with legal obligations
- Automated archiving
- Right to erasure propagated to processors
- Certified deletion evidence
- Versioned retention-as-code

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No retention policy. Data kept indefinitely. Right to erasure not implemented. |
| 1 | Informal policy. Occasional manual purges. Right to erasure case by case. |
| 2 | Documented policy per data category. Defined durations. Formalized right-to-erasure process. |
| 3 | Automated retention with TTL. Right-to-erasure workflow integrated with dependent systems. Legal hold supported. Deletion evidence. |
| 4 | Fully automated lifecycle management. Cost-optimized tiered storage. Right to erasure propagated to processors. Certified audit trail. Versioned retention-as-code. |

---

### DG-08 - Data architecture and topology (Data Mesh) - Criticality: **SHOULD**

**Analyze:** Data organization, data domains, data products, self-service platform

**Verification commands:**
```bash
grep -ri "data.mesh\|data.product\|data.domain\|data.platform\|federated.governance" . --include="*.md" --include="*.yml" 2>/dev/null | head -10
grep -ri "data.warehouse\|data.lake\|lakehouse\|dbt\|airflow\|dagster" . --include="*.yml" --include="*.yaml" --include="*.py" 2>/dev/null | head -10
```

**Check:**
- Data architecture defined and documented
- Data domains identified with ownership
- Data products with documentation and SLA
- Self-service platform for ingestion/transformation/publication
- Federated governance (policies as code)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No data architecture defined. Isolated silos. Each team manages independently. |
| 1 | Implicit architecture centered on a single data warehouse/lake. Overloaded centralized data team. |
| 2 | Documented architecture with identified data zones. Domains defined. First data-product initiatives. |
| 3 | Data Mesh or federated architecture in place. Data products with domain owners. Self-serve platform. Federated governance. |
| 4 | Mature Data Mesh with a marketplace of data products. Automated computational governance (policies as code). Measured cross-domain interoperability. Consumer-producer feedback loop. |
