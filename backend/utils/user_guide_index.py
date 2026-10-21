# utils/user_guide_index.py
"""
Search index over the MeterSquare user guide (backend/docs/user_guide/*.md).

The guide is the single source for both the PDF and the in-app assistant. It is
split into sections at '##' / '###' headings; each section is scored against the
question with BM25, with a small boost for sections about the asker's role.
The index reloads automatically when a guide file changes.
"""

import difflib
import math
import os
import re
import threading
from collections import Counter

GUIDE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'user_guide')

# Guide file -> roles it is mainly about (normalized role names). Files not listed apply to everyone.
FILE_ROLES = {
    'admin': {'admin'},
    'estimator': {'estimator'},
    'technical-director': {'technicaldirector'},
    'project-manager': {'projectmanager', 'mep'},
    'site-engineer': {'siteengineer'},
    'procurement': {'buyer'},
    'production-manager': {'productionmanager'},
}
# Sections of a role chapter that another role also does (chapter, ## section) -> extra roles
SECTION_EXTRA_ROLES = {
    ('admin', 'Role Access (temporary extra roles)'): {'technicaldirector'},
}

_STOPWORDS = set("""
a an the and or of to in on for with by at from is are was were be been it this that these those as do does did
how what when where who which why can i me my we our you your he she they them it's is there their then than into
about please tell show need want get go use using via will would should could
""".split())

_lock = threading.Lock()
_index = {'mtimes': None, 'sections': [], 'df': Counter(), 'avgdl': 1.0}


def normalize_role(name):
    return (name or '').lower().replace(' ', '').replace('_', '').replace('-', '')


def _tokens(text):
    words = re.findall(r"[a-z0-9]+", text.lower())
    out = []
    for w in words:
        if w in _STOPWORDS or len(w) < 2:
            continue
        # light stemming so "approve/approved/approving/approval" match
        for suffix in ('ings', 'ing', 'ed', 'es', 's', 'al'):
            if len(w) > len(suffix) + 3 and w.endswith(suffix):
                w = w[: -len(suffix)]
                break
        out.append(w)
    return out


# Words users say for what the guide calls something else (stemmed token -> guide tokens)
_SYNONYMS = {
    'extern': ['client'],  # "external revision" = client revision
}


# How users name a role in a question -> normalized role
_ROLE_WORDS = [
    (r'\bestimat\w*', 'estimator'),
    (r'\btechnical director\b|\btd\b', 'technicaldirector'),
    (r'\bproject manager\b|\bpm\b', 'projectmanager'),
    (r'\bmep\b', 'mep'),
    (r'\bsite (?:engineer|supervisor)\b|\bse\b', 'siteengineer'),
    (r'\bbuyer\b|\bprocurement\b', 'buyer'),
    (r'\bproduction manager\b|\bm2 store\b|\bstore manager\b', 'productionmanager'),
    (r'\badmin\w*', 'admin'),
]


# A role named as the place the question is about ("revisions in estimator", "the TD's screen"),
# not as the other party of a task ("send a BOQ to the Technical Director")
_ROLE_CONTEXT = (r"(?:\b(?:in|for|as|of|by|inside|within|under)\s+(?:the\s+|an?\s+)?(?:{0})"
                 r"|(?:{0})(?:'s|s'|\s+(?:role|side|screens?|module|dashboard|view|login|account|chapter|menu|page|tab)s?\b))")


def _role_matches(text):
    for pattern, role in _ROLE_WORDS:
        for m in re.finditer(_ROLE_CONTEXT.format(pattern), text, re.I):
            yield role, re.search(pattern, m.group(0), re.I).group(0)


def mentioned_roles(text):
    """Roles the question is about ("revisions in estimator", "the TD's dashboard", ...)."""
    return {role for role, _word in _role_matches(text)}


def role_mentions(text):
    """The words the question names those roles with, e.g. ['estimator']."""
    return [word for _role, word in _role_matches(text)]


def _query_tokens(query, df):
    """The question's tokens, with misspellings ("revistion") corrected to the guide's words and synonyms added."""
    out = []
    for t in _tokens(query):
        if t not in df and len(t) >= 5:
            close = difflib.get_close_matches(t, _SYNONYMS.keys(), n=1, cutoff=0.8) \
                or difflib.get_close_matches(t, df.keys(), n=1, cutoff=0.8)
            t = close[0] if close else t
        out.append(t)
        out += _SYNONYMS.get(t, [])
    return out


def _file_roles(filename):
    stem = re.sub(r'^\d+[-_]', '', os.path.splitext(filename)[0])
    return FILE_ROLES.get(stem, set())


def _split_sections(filename, text):
    """Split one markdown file into sections at ## / ### headings, keeping a breadcrumb title."""
    roles = _file_roles(filename)
    sections, h1, h2 = [], '', ''
    current_title, buf, images = None, [], []
    last_step = [0]  # number of the last numbered step seen in this section (0 = before the steps)
    last_raw, step_offset = [0], [0]

    def flush():
        body = '\n'.join(buf).strip()
        if current_title and body:
            stem = re.sub(r'^\d+[-_]', '', os.path.splitext(filename)[0])
            extra = SECTION_EXTRA_ROLES.get((stem, h2), set())
            sections.append({'file': filename, 'title': current_title, 'text': body, 'roles': roles | extra,
                             'images': list(images)})
        images.clear()
        last_step[0] = last_raw[0] = step_offset[0] = 0

    for line in text.splitlines():
        m = re.match(r'^(#{1,3})\s+(.*)$', line)
        if m:
            level, title = len(m.group(1)), m.group(2).strip()
            if level == 1:
                flush(); buf = []
                h1, h2 = title, ''
                current_title = h1
            elif level == 2:
                flush(); buf = []
                h2 = title
                current_title = f"{h1} › {h2}" if h1 else h2
            else:
                flush(); buf = []
                base = f"{h1} › {h2}" if h2 else h1
                current_title = f"{base} › {title}" if base else title
            continue
        shot = re.match(r'^!\[([^\]]*)\]\(images/([a-z0-9-]+\.jpg)\)\s*$', line)
        if shot:
            # Screenshots stay out of the searchable text; the assistant may show them by file name.
            # 'step' = the numbered step the screenshot follows (0 = before the steps).
            images.append({'file': shot.group(2), 'caption': shot.group(1), 'step': last_step[0]})
            continue
        step = re.match(r'^(\d+)[.)]\s', line)
        if step:
            # number on through lists that restart at 1 (Step 1: 1-5, Step 2: 1-4 -> 1-9)
            n = int(step.group(1))
            if n <= last_raw[0]:
                step_offset[0] += last_raw[0]
            last_raw[0] = n
            last_step[0] = step_offset[0] + n
        buf.append(line)
    flush()

    # A sub-section without its own screenshot (e.g. "How to reject a BOQ") can show one from its topic
    # (the same ## section and its sub-sections), offered after the section's own screenshots.
    topic = lambda s: ' › '.join(s['title'].split(' › ')[:2])
    by_topic = {}
    for s in sections:
        by_topic.setdefault(topic(s), []).extend(s['images'])
    for s in sections:
        own = {img['file'] for img in s['images']}
        seen, related = set(own), []
        for img in by_topic[topic(s)]:
            if img['file'] not in seen:
                seen.add(img['file'])
                related.append(img)
        s['related_images'] = related
    return sections


def _current_mtimes():
    if not os.path.isdir(GUIDE_DIR):
        return {}
    return {
        f: os.path.getmtime(os.path.join(GUIDE_DIR, f))
        for f in sorted(os.listdir(GUIDE_DIR)) if f.endswith('.md')
    }


def _ensure_index():
    mtimes = _current_mtimes()
    if _index['mtimes'] == mtimes:
        return
    with _lock:
        if _index['mtimes'] == mtimes:
            return
        sections = []
        for f in mtimes:
            with open(os.path.join(GUIDE_DIR, f), encoding='utf-8') as fh:
                sections.extend(_split_sections(f, fh.read()))
        df = Counter()
        for s in sections:
            s['tf'] = Counter(_tokens(s['title'] + ' ' + s['title'] + ' ' + s['text']))
            s['len'] = sum(s['tf'].values()) or 1
            df.update(set(s['tf']))
        _index.update({
            'mtimes': mtimes,
            'sections': sections,
            'df': df,
            'avgdl': (sum(s['len'] for s in sections) / len(sections)) if sections else 1.0,
        })


def search(query, role=None, limit=6, max_chars=14000):
    """Top guide sections for the query (BM25 + role boost), trimmed to max_chars in total."""
    _ensure_index()
    sections, df, avgdl = _index['sections'], _index['df'], _index['avgdl']
    if not sections:
        return []
    q = _query_tokens(query, df)
    n = len(sections)
    role_n = normalize_role(role)
    # A role named in the question ("revisions in estimator") outranks the asker's own role
    named = mentioned_roles(query)
    k1, b = 1.4, 0.75
    scored = []
    for s in sections:
        score = 0.0
        for t in q:
            tf = s['tf'].get(t)
            if not tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * s['len'] / avgdl))
        if score:
            # the section's own title in the question ("Admin Dashboard", "receive and process a return")
            own_title = s.setdefault('title_tokens', set(_tokens(s['title'].split(' › ')[-1])))
            if own_title:
                score *= 1 + 0.6 * len(own_title & set(q)) / len(own_title)
        if score and named and named & s['roles']:
            score *= 1.6
        elif score and role_n and role_n in s['roles']:
            score *= 1.35
        if score:
            scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)

    results, total = [], 0
    for _score, s in scored[:limit]:
        text = s['text']
        if total + len(text) > max_chars:
            text = text[: max(0, max_chars - total)]
        if not text:
            break
        results.append({'title': s['title'], 'text': text, 'file': s['file'], 'roles': sorted(s['roles']),
                        'images': s.get('images', []), 'related_images': s.get('related_images', [])})
        total += len(text)
    return results


def overview_sections(role=None, max_chars=5000):
    """
    Background for vague or conversational questions: the asker's role chapter
    introduction plus the general overview ("Roles in MeterSquare", main flow).
    """
    _ensure_index()
    role_n = normalize_role(role)
    picks = []
    # The real list of topics in the asker's role chapter (keeps "what can I do?" answers factual)
    role_files = sorted({s['file'] for s in _index['sections'] if role_n and role_n in s['roles']})
    for f in role_files:
        chapter = [s['title'] for s in _index['sections'] if s['file'] == f]
        topics = [t.split(' › ')[1] for t in chapter if t.count(' › ') == 1]
        if chapter and topics:
            picks.append({
                'title': f"{chapter[0].split(' › ')[0]} › Topics in this chapter",
                'text': 'This role can do the following (these are the only features for this role):\n'
                        + '\n'.join(f"- {t}" for t in topics),
                'file': f,
            })
    for s in _index['sections']:
        is_role_intro = role_n and role_n in s['roles'] and ' › ' not in s['title']
        is_overview = s['file'].startswith('01-') and s['title'].split(' › ')[-1] in (
            'Roles in MeterSquare', 'How the main process flows')
        if is_role_intro or is_overview:
            picks.append({'title': s['title'], 'text': s['text'][:max_chars // 3], 'file': s['file']})
    return picks


def sections_titled(title_suffix):
    """Sections whose title ends with title_suffix (e.g. 'Glossary')."""
    _ensure_index()
    return [{'title': s['title'], 'text': s['text'], 'file': s['file']}
            for s in _index['sections'] if s['title'].endswith(title_suffix)]


def section_count():
    _ensure_index()
    return len(_index['sections'])


def guide_tokens(text):
    """The words of the text the search matches on (no stopwords, lightly stemmed)."""
    return _tokens(text)
