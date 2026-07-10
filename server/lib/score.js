// Deterministic match-score heuristic. No LLM — runs with no AI key.
//
// Idea: tokenize the job description and the resume, find the meaningful
// keywords the job asks for, and check how many the resume covers. The
// score is the skills_coverage fraction mapped to an integer 0–100.
//
// Returns: { value, matched_keywords, missing_keywords, skills_coverage }

// Common English / boilerplate words we don't want to count as "skills".
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'to', 'of',
  'in', 'on', 'at', 'by', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'we', 'you', 'your', 'our', 'us', 'they', 'their', 'i', 'me', 'my',
  'it', 'its', 'this', 'that', 'these', 'those', 'will', 'would', 'can', 'could',
  'should', 'have', 'has', 'had', 'do', 'does', 'did', 'not', 'no', 'yes', 'from',
  'into', 'about', 'over', 'under', 'who', 'whom', 'which', 'what', 'where', 'when',
  'how', 'all', 'any', 'each', 'more', 'most', 'other', 'some', 'such', 'than',
  'too', 'very', 'just', 'also', 'so', 'up', 'out', 'own', 'work', 'working',
  'team', 'role', 'years', 'year', 'experience', 'required', 'requirements',
  'responsibilities', 'must', 'plus', 'nice', 'strong', 'across', 'using', 'use',
  'build', 'building', 'own', 'help', 'join', 'looking', 'hiring', 'hire', 'we',
  'are', 'an', 'end', 'ability', 'including', 'etc', 'within', 'per', 'via',
]);

// Multi-word skills/phrases we want to detect as a single keyword. Order
// matters only for readability; matching is independent.
const KNOWN_PHRASES = [
  'machine learning', 'deep learning', 'recommendation systems', 'recommendation system',
  'feature store', 'feature stores', 'feature engineering', 'data science', 'data scientist',
  'data analysis', 'data analyst', 'data engineering', 'natural language processing',
  'computer vision', 'reinforcement learning', 'time series', 'a/b testing', 'ab testing',
  'large language models', 'large language model', 'prompt engineering', 'vector database',
  'vector databases', 'model evaluation', 'model deployment', 'distributed systems',
  'cloud computing', 'big data', 'data pipelines', 'data pipeline', 'etl pipelines',
  'neural networks', 'neural network', 'statistical modeling', 'experimentation',
  'llm evaluation', 'llm as judge', 'retrieval augmented generation',
];

function normalize(text) {
  return (text || '').toLowerCase();
}

// Tokenize into single-word tokens, dropping stop words and short noise.
function tokenize(text) {
  const tokens = normalize(text)
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
  return tokens;
}

// Extract the set of meaningful keywords/phrases from a job description.
function extractJobKeywords(description) {
  const text = normalize(description);
  const found = new Set();

  for (const phrase of KNOWN_PHRASES) {
    if (text.includes(phrase)) found.add(phrase);
  }

  for (const token of tokenize(description)) {
    // Skip single tokens already covered by a detected phrase.
    let covered = false;
    for (const phrase of found) {
      if (phrase.includes(token)) {
        covered = true;
        break;
      }
    }
    if (!covered) found.add(token);
  }

  return found;
}

// Build a searchable haystack of the resume (phrases + tokens).
function buildResumeIndex(resume) {
  const text = normalize(resume);
  const tokenSet = new Set(tokenize(resume));
  return { text, tokenSet };
}

function resumeHas(keyword, index) {
  if (keyword.includes(' ')) {
    // Phrase: substring match against full resume text.
    return index.text.includes(keyword);
  }
  return index.tokenSet.has(keyword);
}

// Ordered list of the meaningful keywords/phrases a job asks for. Exported so
// the no-AI tailoring fallback can weave the same terms the scorer rewards into
// the generated resume.
export function extractKeywords(jobDescription) {
  return [...extractJobKeywords(jobDescription)];
}

export function computeScore(jobDescription, resumeContent) {
  const jobKeywords = [...extractJobKeywords(jobDescription)];
  const index = buildResumeIndex(resumeContent);

  const matched = [];
  const missing = [];

  for (const kw of jobKeywords) {
    if (resumeHas(kw, index)) matched.push(kw);
    else missing.push(kw);
  }

  const total = jobKeywords.length;
  const skillsCoverage = total === 0 ? 0 : matched.length / total;
  const value = Math.round(skillsCoverage * 100);

  // Keep the breakdown readable: cap the keyword lists.
  return {
    value,
    matched_keywords: matched.slice(0, 25),
    missing_keywords: missing.slice(0, 25),
    skills_coverage: Math.round(skillsCoverage * 100) / 100,
  };
}
