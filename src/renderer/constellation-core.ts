// @ts-nocheck -- classic renderer script; PURE constellation selection, no DOM (DECISIONS #171).
/*
 * Constellation selection, as a renderer global script.
 *
 * Same reason as `connection-core.ts`: the renderer is plain global scripts and
 * cannot `import` `src/shared/constellation-templates.ts` (which is not copied
 * into `dist/src`). This file is the same rule set, and
 * `constellation-parity.test.ts` runs BOTH implementations against the same
 * inputs — every constellation, 0..12 pairs — and fails the unit suite on any
 * divergence.
 *
 * What lives here is only the picture: which stars a board of n pairs lights,
 * which links join them, and the template SHAPE the existing progression
 * understands. The progression itself is NOT re-implemented (DECISIONS #171);
 * `planConnectionStages` in `connection-core.ts` still owns it.
 */
function constellationResolve(id) {
  var key = typeof id === 'string' ? id.trim() : (id && typeof id.id === 'string' ? id.id : '');
  // Absent is not unknown: a game that never chose a constellation plays the
  // "để tự động" figure instead of having the default forced on it.
  if (!key) key = AUTO_CONSTELLATION;
  for (var i = 0; i < CONSTELLATION_TEMPLATES.length; i += 1) {
    if (CONSTELLATION_TEMPLATES[i].id === key) return CONSTELLATION_TEMPLATES[i];
  }
  var mapped = typeof mapLegacyConstellation === 'function'
    ? mapLegacyConstellation(key)
    : (LEGACY_CONNECTION_MAP[key] || '');
  if (mapped) {
    for (var j = 0; j < CONSTELLATION_TEMPLATES.length; j += 1) {
      if (CONSTELLATION_TEMPLATES[j].id === mapped) return CONSTELLATION_TEMPLATES[j];
    }
  }
  return CONSTELLATION_TEMPLATES[0];
}

/** Old connection id → constellation id ('' when it is not a legacy id). */
function mapLegacyConstellation(oldId) {
  var key = typeof oldId === 'string' ? oldId.trim() : '';
  return LEGACY_CONNECTION_MAP[key] || '';
}

/** True for an id this build ships, or an old id it can map. */
function isConstellationTemplateId(id) {
  var key = typeof id === 'string' ? id.trim() : '';
  if (!key) return false;
  for (var i = 0; i < CONSTELLATION_TEMPLATES.length; i += 1) {
    if (CONSTELLATION_TEMPLATES[i].id === key) return true;
  }
  return Boolean(LEGACY_CONNECTION_MAP[key]);
}

function constellationResolveDragDirection(value) {
  return value === 'right-to-left' ? 'right-to-left' : DEFAULT_DRAG_DIRECTION;
}

function constellationOrderedStars(template) {
  var resolved = constellationResolve(template);
  var byId = {};
  var i;
  for (i = 0; i < resolved.stars.length; i += 1) byId[resolved.stars[i].id] = resolved.stars[i];
  var ordered = [];
  for (i = 0; i < resolved.priority.length; i += 1) {
    if (byId[resolved.priority[i]]) ordered.push(byId[resolved.priority[i]]);
  }
  // A star the priority list forgot is appended, so a count is never short.
  for (i = 0; i < resolved.stars.length; i += 1) {
    var known = false;
    for (var j = 0; j < ordered.length; j += 1) if (ordered[j].id === resolved.stars[i].id) known = true;
    if (!known) ordered.push(resolved.stars[i]);
  }
  return ordered;
}

/** Same rule as `selectConstellationStars` in the shared module. */
function selectConstellationStars(template, count) {
  var ordered = constellationOrderedStars(template);
  var numeric = count === null || count === '' ? NaN : Number(count);
  var asked = isFinite(numeric) && numeric >= 0 ? Math.max(1, Math.round(numeric)) : CONSTELLATION_STAR_MIN;
  var wanted = Math.min(CONSTELLATION_STAR_MAX, asked);
  return ordered.slice(0, Math.min(wanted, ordered.length));
}

/** Stars and links for one board, computed once (same result as the shared module). */
function selectConstellation(template, pairCount) {
  var resolved = constellationResolve(template);
  var stars = selectConstellationStars(resolved, pairCount);
  var chosen = {};
  var i;
  for (i = 0; i < stars.length; i += 1) chosen[stars[i].id] = true;
  var links = [];
  var pendingLinks = [];
  for (i = 0; i < resolved.edges.length; i += 1) {
    var edge = resolved.edges[i];
    var a = Boolean(chosen[edge.from]);
    var b = Boolean(chosen[edge.to]);
    if (a && b) links.push({ id: edge.id, from: edge.from, to: edge.to });
    else if (a || b) pendingLinks.push({ id: edge.id, from: edge.from, to: edge.to });
  }
  var extraStars = [];
  for (i = 0; i < resolved.stars.length; i += 1) {
    if (!chosen[resolved.stars[i].id]) extraStars.push(resolved.stars[i]);
  }
  return { stars: stars, links: links, pendingLinks: pendingLinks, extraStars: extraStars };
}

/** Same stage id rule as the shared module: stable, unique within a board. */
function constellationStageId(starId, index) {
  return 'star-' + (index + 1) + '-' + starId;
}

/**
 * The constellation as the `{ id, stages[] }` template the EXISTING progression
 * already understands. The progression code is not touched; this is the only
 * bridge between a star and a stage.
 */
function constellationTemplateShape(template, pairCount) {
  var resolved = constellationResolve(template);
  var picked = selectConstellation(resolved, pairCount);
  var stageOf = {};
  var stages = [];
  var i;
  for (i = 0; i < picked.stars.length; i += 1) {
    var star = picked.stars[i];
    var id = constellationStageId(star.id, i);
    stageOf[star.id] = id;
    var edgeIds = [];
    if (i === 0) {
      for (var p = 0; p < picked.pendingLinks.length; p += 1) edgeIds.push(picked.pendingLinks[p].id);
    }
    stages.push({
      id: id,
      label: star.label || ('Sao ' + (i + 1)),
      // A COPY: the plan pushes into the template it is given (planConnectionStages),
      // and edgeIds here is a fresh local array, so the plan cannot write back.
      edgeIds: edgeIds.slice(),
      nodeIds: [star.id]
    });
  }
  for (i = 0; i < picked.links.length; i += 1) {
    var link = picked.links[i];
    var ownerIndex = -1;
    for (var s = 0; s < stages.length; s += 1) {
      if (stages[s].id === stageOf[link.from] || stages[s].id === stageOf[link.to]) ownerIndex = s;
    }
    if (ownerIndex >= 0) stages[ownerIndex].edgeIds.push(link.id);
  }
  var nodes = [];
  for (i = 0; i < picked.stars.length; i += 1) {
    nodes.push({ id: picked.stars[i].id, x: picked.stars[i].x, y: picked.stars[i].y, label: picked.stars[i].label, kind: 'dot' });
  }
  return {
    id: resolved.id,
    name: resolved.name,
    description: resolved.description,
    subjectHint: resolved.subjectHint,
    nodes: nodes,
    edges: picked.links.slice(),
    stages: stages
  };
}

/** Short caption beside a star ("Bắc Đẩu 1", "Sao 4"). */
function constellationStarCaption(star, index) {
  var label = star && star.label ? String(star.label) : '';
  return label ? label + ' ' + (index + 1) : 'Sao ' + (index + 1);
}
