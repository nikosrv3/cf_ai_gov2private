export const NormalizedResumeJsonSchema = {
  name: "normalized_resume",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: ["string", "null"], maxLength: 120 },
      contact: {
        type: "object",
        additionalProperties: false,
        properties: {
          email: { type: ["string", "null"], maxLength: 120 },
          phone: { type: ["string", "null"], maxLength: 64 },
          location: { type: ["string", "null"], maxLength: 120 },
          links: {
            type: "array",
            items: { type: "string", maxLength: 200 },
            maxItems: 10
          }
        },
        required: ["email", "phone", "location", "links"]
      },
      summary: { type: ["string", "null"], maxLength: 500 },
      education: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            degree: { type: "string", maxLength: 120 },
            field: { type: ["string", "null"], maxLength: 160 },
            institution: { type: "string", maxLength: 200 },
            year: { type: ["string", "null"], maxLength: 10 }
          },
          required: ["degree", "institution"]
        }
      },
      skills: {
        type: "array",
        maxItems: 100,
        items: {
          type: "string",
          maxLength: 40
        }
      },
      certifications: {
        type: "array",
        maxItems: 20,
        items: {
          type: "string",
          maxLength: 120
        }
      },
      experience: {
        type: "array",
        maxItems: 8, // keep recent 8 roles
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", maxLength: 120 },
            org: { type: "string", maxLength: 160 },
            location: { type: ["string", "null"], maxLength: 120 },
            start: { type: ["string", "null"], maxLength: 40 },
            end: { type: ["string", "null"], maxLength: 40 },
            bullets: {
              type: "array",
              maxItems: 4, // force concise output
              items: { type: "string", maxLength: 220 }
            },
            skills: {
              type: "array",
              maxItems: 20,
              items: { type: "string", maxLength: 40 }
            }
          },
          required: ["title", "org", "bullets", "skills"]
        }
      }
    },
    required: ["name", "contact", "education", "skills", "experience"]
  },
  strict: true as const
};

/* ========================================================================== */
/*  Smaller step schemas for your chunked Workflow                            */
/* ========================================================================== */

export const ProfileOnlyJsonSchema = {
  name: "normalized_profile",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: ["string", "null"], maxLength: 120 },
      contact: {
        type: "object",
        additionalProperties: false,
        properties: {
          email: { type: ["string", "null"], maxLength: 120 },
          phone: { type: ["string", "null"], maxLength: 64 },
          location: { type: ["string", "null"], maxLength: 120 },
          links: {
            type: "array",
            items: { type: "string", maxLength: 200 },
            maxItems: 10
          }
        },
        required: ["email", "phone", "location", "links"]
      },
      education: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            degree: { type: "string", maxLength: 120 },
            field: { type: ["string", "null"], maxLength: 160 },
            institution: { type: "string", maxLength: 200 },
            year: { type: ["string", "null"], maxLength: 10 }
          },
          required: ["degree", "institution"]
        }
      }
    },
    required: ["name", "contact", "education"]
  },
  strict: true as const
};

export const SkillsOnlyJsonSchema = {
  name: "normalized_skills",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "array",
    items: { type: "string", maxLength: 40 },
    maxItems: 100
  },
  strict: true as const
};

export const ExperienceChunkJsonSchema = {
  name: "normalized_experience_chunk",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "array",
    maxItems: 4, // one chunk == 4 roles
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 120 },
        org: { type: "string", maxLength: 160 },
        location: { type: ["string", "null"], maxLength: 120 },
        start: { type: ["string", "null"], maxLength: 40 },
        end: { type: ["string", "null"], maxLength: 40 },
        bullets: {
          type: "array",
          maxItems: 4,
          items: { type: "string", maxLength: 220 }
        },
        skills: {
          type: "array",
          maxItems: 20,
          items: { type: "string", maxLength: 40 }
        }
      },
      required: ["title", "org", "bullets", "skills"]
    }
  },
  strict: true as const
};

export const ContactOnlyJsonSchema = {
  name: "contact_only",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: ["string", "null"], maxLength: 120 },
      contact: {
        type: "object",
        additionalProperties: false,
        properties: {
          email: { type: ["string", "null"], maxLength: 120 },
          phone: { type: ["string", "null"], maxLength: 64 },
          location: { type: ["string", "null"], maxLength: 120 },
          links: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 10 }
        },
        required: ["email", "phone", "location", "links"]
      }
    },
    required: ["name", "contact"]
  },
  strict: true as const
};

/* ========================================================================== */
/*  Role discovery & requirements                                             */
/* ========================================================================== */

export const JobRoleJsonSchema = {
  name: "job_role",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", maxLength: 64 },
      title: { type: "string", maxLength: 80 },
      company: { type: ["string", "null"], maxLength: 120 },
      description: { type: "string", maxLength: 500 },
      requirements: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 100 }
      },
      score: { type: ["number", "null"], minimum: 0, maximum: 100 },
      source: { type: ["string", "null"], enum: ["ai", "user"] }
    },
    required: ["id", "title", "description"]
  },
  strict: true as const
};

export const RoleCandidatesJsonSchema = {
  name: "role_candidates",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", maxLength: 64 },
            title: { type: "string", maxLength: 80 },
            company: { type: ["string", "null"], maxLength: 120 },
            description: { type: "string", maxLength: 500 },
            requirements: {
              type: "array",
              maxItems: 20,
              items: { type: "string", maxLength: 100 }
            },
            score: { type: ["number", "null"], minimum: 0, maximum: 100 },
            source: { type: ["string", "null"], enum: ["ai", "user"] }
          },
          required: ["id", "title", "description"]
        }
      }
    },
    required: ["candidates"]
  },
  strict: true as const
};

export const RequirementsJsonSchema = {
  name: "requirements",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      must_have: {
        type: "array",
        maxItems: 40,
        items: { type: "string", maxLength: 60 }
      },
      nice_to_have: {
        type: "array",
        maxItems: 40,
        items: { type: "string", maxLength: 60 }
      }
    },
    required: ["must_have", "nice_to_have"]
  },
  strict: true as const
};

/* ========================================================================== */
/*  Mapping & bullets                                                         */
/* ========================================================================== */

export const TransferableMappingJsonSchema = {
  name: "transferable_mapping",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      mapping: {
        type: "array",
        maxItems: 60,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            requirement: { type: "string", maxLength: 80 },
            matched_skills: {
              type: "array",
              maxItems: 10,
              items: { type: "string", maxLength: 40 }
            },
            evidence: {
              type: "array",
              maxItems: 6,
              items: { type: "string", maxLength: 220 }
            }
          },
          required: ["requirement", "matched_skills", "evidence"]
        }
      }
    },
    required: ["mapping"]
  },
  strict: true as const
};

export const BulletBatchJsonSchema = {
  name: "bullet_batch",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      bullets: {
        type: "array",
        maxItems: 20, // keep safe for batch transforms
        items: { type: "string", maxLength: 300 }
      }
    },
    required: ["bullets"]
  },
  strict: true as const
};