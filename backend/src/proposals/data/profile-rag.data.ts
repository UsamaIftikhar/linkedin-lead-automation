/**
 * Authoritative profile for proposal RAG. Edit PROFILE_DATASET; chunks are derived automatically.
 */

export type ExperienceType =
  | 'education'
  | 'linkedin_summary'
  | 'personal_projects'
  | 'project'
  | 'proposal'
  | 'skills'
  | 'work_experience';

export interface ExperienceItem {
  id: string;
  type: ExperienceType;
  tags: string[];
  content: string;
}

type WorkExperienceEntry = {
  id: string;
  type: 'work_experience';
  role: string;
  company: string;
  duration: string;
  projects: Array<{ description: string; name: string; url?: string }>;
};

type SkillsEntry = {
  id: 'skills';
  type: 'skills';
  categories: Record<string, string[]>;
};

type EducationEntry = {
  id: 'education';
  type: 'education';
  degree: string;
  duration: string;
  institution: string;
};

type PersonalProjectsEntry = {
  id: 'personal_projects';
  type: 'personal_projects';
  projects: Array<{ description: string; name: string }>;
};

type LinkedinSummaryEntry = {
  id: 'linkedin_summary';
  type: 'linkedin_summary';
  content: string;
};

export type ProfileDatasetEntry =
  | EducationEntry
  | LinkedinSummaryEntry
  | PersonalProjectsEntry
  | SkillsEntry
  | WorkExperienceEntry;

export const PROFILE_DATASET: ProfileDatasetEntry[] = [
  {
    id: 'exp1',
    type: 'work_experience',
    role: 'Senior Software Engineer',
    company: 'Devorbis',
    duration: 'May 2022 - Present',
    projects: [
      {
        name: 'Evercare (Medical Caregivers Platform)',
        url: 'LINK',
        description:
          'Led development of client portal for scheduling, matchmaking, billing, and caregiver compensation. Frontend with Vue2, Vue3, Nuxt.js, Pinia, Chart.js. Backend with Node.js, Express.js, Sequelize, MySQL. Deployed on AWS EC2.',
      },
      {
        name: 'Retrieval-Augmented Generation (RAG) application',
        description:
          'Developed a RAG application using advanced Mistral models, trained on domain-specific data. Integrated with React frontend and Django REST framework backend. Used Python for model training and backend services.',
      },
    ],
  },
  {
    id: 'exp2',
    type: 'work_experience',
    role: 'Software Engineer',
    company: 'Technove',
    duration: 'July 2020 - May 2022',
    projects: [
      {
        name: 'Carletz (Car Sales Platform)',
        description:
          'Built full-stack application using NestJS, NodeJS, NextJS, ReactJS. Integrated Stripe payments, AWS S3 storage, automated tests with Jest, deployed on Heroku. Used Jira for project tracking.',
      },
      {
        name: 'Shareverse (Airbnb Clone)',
        description:
          'Developed rental system frontend using React, MaterialUI, Typescript, Redux. Integrated Stripe for payments, deployed on Heroku.',
      },
    ],
  },
  {
    id: 'skills',
    type: 'skills',
    categories: {
      coding: [
        'JavaScript (ES6+)',
        'Python (Beginner)',
        'React.js (Redux, Hooks, Next.js)',
        'Node.js (Sequelize ORM)',
        'Express.js (REST API)',
        'MySQL',
        'PostgreSQL',
        'Git',
        'Redis',
        'Vue.js',
        'Async Programming',
        'Functional Programming',
        'Chrome Extension',
        'Nest.js',
        'Jest',
        'Vite',
        'Webhooks',
        'Websocket',
      ],
      service_design: [
        'Design Patterns',
        'Clean Architecture',
        'Input Validations',
        'Observability',
        'Authentication',
        'TDD',
      ],
      devops: [
        'AWS (EC2, S3, ECR, ECS)',
        'Render',
        'Docker',
        'Netlify',
        'Serverless (Vercel)',
        'Heroku',
      ],
    },
  },
  {
    id: 'education',
    type: 'education',
    degree: 'Bachelors of Science in Computer Science',
    institution:
      'National University of Computer and Emerging Sciences (FAST-NUCES)',
    duration: 'July 2016 - July 2020',
  },
  {
    id: 'personal_projects',
    type: 'personal_projects',
    projects: [
      {
        name: 'Defi Wallet (Crypto Wallet Platform)',
        description:
          'Frontend development using React, Three.js, Redux. Integrated internal APIs and crypto payments. Optimized app size by 50% and improved page load speed by 70%.',
      },
    ],
  },
  {
    id: 'linkedin_summary',
    type: 'linkedin_summary',
    content:
      'Senior Full-Stack Engineer with 5+ years of experience building scalable web and AI products for global clients. Experienced in frontend (React, Next.js, Vue), backend (Node.js, NestJS, Django), AWS deployments, and AI-driven solutions like RAG systems and voice assistants. Strong in remote collaboration and end-to-end product ownership.',
  },
];

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function tagsForWorkProject(projectName: string): string[] {
  const n = projectName.toLowerCase();
  if (n.includes('evercare')) {
    return [
      'vue',
      'nuxt',
      'pinia',
      'chartjs',
      'nodejs',
      'express',
      'sequelize',
      'mysql',
      'aws',
      'ec2',
      'healthcare',
      'scheduling',
      'billing',
      'caregivers',
    ];
  }
  if (n.includes('rag') || n.includes('retrieval')) {
    return [
      'rag',
      'mistral',
      'react',
      'django',
      'python',
      'ai',
      'ml',
      'embeddings',
      'llm',
    ];
  }
  if (n.includes('carletz')) {
    return [
      'nestjs',
      'nextjs',
      'react',
      'stripe',
      'aws',
      's3',
      'jest',
      'heroku',
      'nodejs',
      'fullstack',
    ];
  }
  if (n.includes('shareverse')) {
    return [
      'react',
      'typescript',
      'redux',
      'stripe',
      'material-ui',
      'rental',
      'heroku',
    ];
  }
  return ['software', 'fullstack'];
}

function tagsFromSkillCategory(category: string, skills: string[]): string[] {
  const base = [category.replace(/_/g, '-')];
  const joined = skills.join(' ').toLowerCase();
  const tokens = joined.match(/[a-z][a-z0-9+#.]*/g) ?? [];
  const stop = new Set([
    'and',
    'with',
    'for',
    'the',
    'rest',
    'api',
    'orm',
    'es6',
  ]);
  const extra = tokens.filter((t) => t.length > 2 && !stop.has(t));
  return [...new Set([...base, ...extra])].slice(0, 40);
}

function tagsForPersonalProject(name: string): string[] {
  const n = name.toLowerCase();
  if (n.includes('defi') || n.includes('wallet') || n.includes('crypto')) {
    return [
      'react',
      'threejs',
      'redux',
      'crypto',
      'defi',
      'wallet',
      'frontend',
      'performance',
    ];
  }
  return ['personal-project'];
}

export function flattenProfileDataset(
  raw: ProfileDatasetEntry[],
): ExperienceItem[] {
  const items: ExperienceItem[] = [];

  for (const entry of raw) {
    if (entry.type === 'work_experience') {
      for (const p of entry.projects) {
        const showUrl =
          p.url && p.url.trim() !== '' && p.url.trim().toUpperCase() !== 'LINK';
        const urlLine = showUrl ? `\nReference: ${p.url}` : '';
        items.push({
          content: `${entry.role} at ${entry.company} (${entry.duration}). Project: ${p.name}.${urlLine}\n${p.description}`,
          id: `${entry.id}-${slug(p.name)}`,
          tags: tagsForWorkProject(p.name),
          type: 'work_experience',
        });
      }
    } else if (entry.type === 'skills') {
      for (const [category, skills] of Object.entries(entry.categories)) {
        items.push({
          content: `Skills (${category.replace(/_/g, ' ')}): ${skills.join('; ')}`,
          id: `skills-${slug(category)}`,
          tags: tagsFromSkillCategory(category, skills),
          type: 'skills',
        });
      }
    } else if (entry.type === 'education') {
      items.push({
        content: `${entry.degree} at ${entry.institution} (${entry.duration}).`,
        id: entry.id,
        tags: ['education', 'computer-science', 'fast-nuces', 'bachelors'],
        type: 'education',
      });
    } else if (entry.type === 'personal_projects') {
      for (const p of entry.projects) {
        items.push({
          content: `Personal project — ${p.name}: ${p.description}`,
          id: `${entry.id}-${slug(p.name)}`,
          tags: tagsForPersonalProject(p.name),
          type: 'personal_projects',
        });
      }
    } else if (entry.type === 'linkedin_summary') {
      items.push({
        content: entry.content,
        id: entry.id,
        tags: [
          'fullstack',
          'senior',
          'remote',
          'react',
          'nextjs',
          'vue',
          'nodejs',
          'nestjs',
          'django',
          'aws',
          'rag',
          'ai',
        ],
        type: 'linkedin_summary',
      });
    }
  }

  return items;
}

/** Chunks used for embedding warm-up + retrieval (cosine + tag filter). */
export const RAG_EXPERIENCE_CHUNKS: ExperienceItem[] =
  flattenProfileDataset(PROFILE_DATASET);
