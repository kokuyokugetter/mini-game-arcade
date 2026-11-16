/* Original implementation. Geography: Natural Earth (public domain). */
(function (root) {
  'use strict';

  const COLORS = ['#c6d9bd', '#e7d497', '#bdcfd9', '#dbc6d9', '#ecc5b4', '#bad7c9', '#d0d5a6', '#c4c6df'];
  const FINAL_LIMIT_MS = 15000;
  const OVERFLOW_MS = 3000;
  const DROP_SCORE = 10_000;
  const ROUND_SCORE = 100_000_000;
  const mergePoints = (left, right) => left * right * 70_000;
  const REGIONS = [
    ['hokkaido', '北海道地方', [1]],
    ['tohoku', '東北地方', [2, 3, 4, 5, 6, 7]],
    ['kanto', '関東地方', [8, 9, 10, 11, 12, 13, 14]],
    ['chubu', '中部地方', [15, 16, 17, 18, 19, 20, 21, 22, 23]],
    ['kinki', '近畿地方', [24, 25, 26, 27, 28, 29, 30]],
    ['chugoku', '中国地方', [31, 32, 33, 34, 35]],
    ['shikoku', '四国地方', [36, 37, 38, 39]],
    ['kyushu', '九州・沖縄地方', [40, 41, 42, 43, 44, 45, 46, 47]]
  ].map(([id, name, ids]) => ({ id, name, ids, bonus: 500_000 + ids.length * 250_000 }));
  const REGION_BONUS_TOTAL = REGIONS.reduce((sum, region) => sum + region.bonus, 0);
  // Merge rewards telescope to 47 * 46 * 35,000, regardless of merge order.
  const COMPLETE_BONUS = ROUND_SCORE - 47 * DROP_SCORE - 47 * 46 * 35_000 - REGION_BONUS_TOTAL;
  const key = (a, b) => [Math.min(a, b), Math.max(a, b)].join(',');
  function closestSurface(pointsA, pointsB, reach) {
    let closest = null, distance = reach;
    function project(point, start, end) {
      const dx = end.x - start.x, dy = end.y - start.y;
      const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
      return { x: start.x + dx * t, y: start.y + dy * t };
    }
    function consider(pointA, pointB) {
      const d = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
      if (d < distance) { distance = d; closest = { pointA, pointB, distance }; }
    }
    for (let i = 0; i < pointsA.length; i++) {
      const a = pointsA[i], nextA = pointsA[(i + 1) % pointsA.length];
      for (let j = 0; j < pointsB.length; j++) {
        const b = pointsB[j], nextB = pointsB[(j + 1) % pointsB.length];
        const ax = nextA.x - a.x, ay = nextA.y - a.y;
        const bx = nextB.x - b.x, by = nextB.y - b.y;
        const cross = ax * by - ay * bx;
        if (Math.abs(cross) > 1e-10) {
          const dx = b.x - a.x, dy = b.y - a.y;
          const t = (dx * by - dy * bx) / cross, u = (dx * ay - dy * ax) / cross;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            const point = { x: a.x + t * ax, y: a.y + t * ay };
            return { pointA: point, pointB: point, distance: 0 };
          }
        }
        consider(a, project(a, b, nextB));
        consider(project(b, a, nextA), b);
      }
    }
    return closest;
  }

  // Preserve the original coastline, including narrow concavities. Each convex
  // part uses exactly the same coordinate frame as the rendered polygon.
  function decompose(M, pts) {
    const lib = M.Common.getDecomp();
    if (!lib) throw new Error('poly-decomp is required for coastline collisions');
    const poly = pts.map(p => [p.x, p.y]);
    lib.removeDuplicatePoints(poly, 0.000001);
    lib.makeCCW(poly);
    lib.removeCollinearPoints(poly, 0.0000001);
    return lib.quickDecomp(poly).map(part => part.map(([x, y]) => ({ x, y })));
  }

  class Puzzle {
    constructor(Matter, data, width = 600, height = 720, random = Math.random) {
      this.M = Matter;
      this.random = random;
      this.width = width;
      this.height = height;
      this.rim = 24;
      this.floor = height - 10;
      this.prefs = new Map(data.prefectures.map(([id, name, area, flat]) => {
        const pts = [];
        for (let i = 0; i < flat.length; i += 2) {
          pts.push({ x: flat[i] + (id === 47 ? 200 : 0), y: flat[i + 1] - (id === 47 ? 430 : 0) });
        }
        const color = COLORS[id < 2 ? 0 : id < 8 ? 1 : id < 15 ? 2 : id < 24 ? 3 : id < 31 ? 4 : id < 36 ? 5 : id < 40 ? 6 : 7];
        return [id, { id, name, area, pts, label: name.replace(/[都府県]$/, ''), color,
          center: Matter.Vertices.centre(pts), parts: decompose(Matter, pts) }];
      }));
      this.adj = new Set(data.adjacency.map(([a, b]) => key(a, b)));
      this.engine = Matter.Engine.create({ gravity: { x: 0, y: 1.15 }, enableSleeping: true,
        positionIterations: 10, velocityIterations: 8 });
      const collect = event => {
        for (const pair of event.pairs) {
          const a = pair.bodyA.parent.group, b = pair.bodyB.parent.group;
          if (!a || !b || a === b) continue;
          const contactKey = key(a.body.id, b.body.id);
          if (!this.contacts.has(contactKey)) this.contacts.set(contactKey, { a, b, counties: new Set() });
          // Keep the identity of the actual touching convex parts. A distant
          // county in the same assembly must not enable this contact to merge.
          this.contacts.get(contactKey).counties.add(key(pair.bodyA.prefectureId, pair.bodyB.prefectureId));
        }
      };
      Matter.Events.on(this.engine, 'collisionStart', collect);
      Matter.Events.on(this.engine, 'collisionActive', collect);
      this.reset();
    }

    reset() {
      this.time = 0;
      this.score = 0;
      this.round = 1;
      this.completed = 0;
      this.totalDropped = 0;
      this.over = false;
      this.endReason = null;
      this.shuffles = 0;
      this.aim = this.width / 2;
      this.beginRound();
    }

    beginRound() {
      const M = this.M;
      M.Composite.clear(this.engine.world, false);
      M.Engine.clear(this.engine);
      this.groups = [];
      this.contacts = new Map();
      this.walls = null;
      this.dropped = 0;
      this.used = new Set();
      this.completedRegions = new Set();
      this.remaining = new Set([...this.prefs.keys()].filter(id => id !== 1));
      this.hokkaidoPending = true;
      this.readyAt = this.time;
      this.overSince = null;
      this.finalWait = null;
      this.completeAt = null;
      this.shuffling = false;
      this.shuffleStartedAt = null;
      this.shuffleTargets = new Map();
      this.shuffleTargetAt = -Infinity;
      this.current = this.takeNext();
      this.next = this.takeNext();
      this.makeWalls();
    }

    // Favor counties adjacent to the live board, without replacement.
    // Reserve Hokkaido for the 47th drop.
    takeNext() {
      if (!this.remaining.size) {
        if (!this.hokkaidoPending) return null;
        this.hokkaidoPending = false;
        return 1;
      }
      const board = this.groups.flatMap(g => g.ids);
      const candidates = [...this.remaining];
      const weights = candidates.map(id => board.some(other => this.adj.has(key(id, other))) ? 10 : 1);
      let choice = this.random() * weights.reduce((sum, w) => sum + w, 0);
      let selected = candidates.at(-1);
      for (let i = 0; i < candidates.length; i++) {
        choice -= weights[i];
        if (choice < 0) { selected = candidates[i]; break; }
      }
      this.remaining.delete(selected);
      return selected;
    }

    makeWalls() {
      const M = this.M, thickness = 150;
      if (this.walls) M.Composite.remove(this.engine.world, this.walls);
      this.walls = [
        M.Bodies.rectangle(-thickness / 2, 0, thickness, this.height * 8, { isStatic: true, slop: 0.02 }),
        M.Bodies.rectangle(this.width + thickness / 2, 0, thickness, this.height * 8, { isStatic: true, slop: 0.02 }),
        M.Bodies.rectangle(this.width / 2, this.floor + thickness / 2, this.width + 300, thickness, { isStatic: true, slop: 0.02 })
      ];
      M.Composite.add(this.engine.world, this.walls);
    }

    resize(width, height) {
      const ratio = width / this.width, dy = height - this.height;
      this.width = width;
      this.height = height;
      this.floor = height - 10;
      this.aim = Math.min(width - 50, Math.max(50, this.aim * ratio));
      this.makeWalls();
      for (const group of this.groups) {
        this.M.Sleeping.set(group.body, false);
        this.M.Body.setPosition(group.body, { x: group.body.position.x * ratio, y: group.body.position.y + dy });
        // Keep the exact same body/render scale, except when a narrower viewport
        // physically cannot contain the existing group.
        const span = group.body.bounds.max.x - group.body.bounds.min.x;
        if (span > width - 12) {
          const k = (width - 12) / span;
          this.M.Body.scale(group.body, k, k);
          group.shape.scale *= k;
          delete group.liftRadius;
          group.shape.offset.x *= k;
          group.shape.offset.y *= k;
          for (const shape of group.shape.shapes) {
            shape.pts = shape.pts.map(p => ({ x: p.x * k, y: p.y * k }));
            shape.label = { x: shape.label.x * k, y: shape.label.y * k };
          }
        }
        this.placeClear(group);
      }
      for (const group of this.groups) group.overflowGraceUntil = this.time + 500;
      this.overSince = null;
    }

    shape(ids) {
      const prefs = ids.map(id => this.prefs.get(id));
      const area = prefs.reduce((sum, p) => sum + p.area, 0);
      const cx = prefs.reduce((sum, p) => sum + p.center.x * p.area, 0) / area;
      const cy = prefs.reduce((sum, p) => sum + p.center.y * p.area, 0) / area;
      // Equal-sized counties retain about 92% of their previous linear size
      // after a two-piece merge. Only the container limits large assemblies.
      let scale = 2.4705 * Math.pow(area / ids.length, -0.15) * Math.pow(ids.length, -0.125);
      const points = prefs.flatMap(p => p.pts);
      const spanX = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
      const spanY = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
      scale = Math.min(scale, this.width * 0.94 / spanX, (this.height - this.rim) * 0.94 / spanY);
      return { scale, cx, cy, offset: { x: 0, y: 0 }, shapes: prefs.map(pref => ({ pref,
        pts: pref.pts.map(p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale })) })) };
    }

    spawn(ids, x, y) {
      const M = this.M, shape = this.shape(ids), parts = [];
      const options = { friction: 0.5, frictionStatic: 0.65, restitution: 0.04, frictionAir: 0.014,
        slop: 0.02, sleepThreshold: 45 };
      for (const item of shape.shapes) {
        for (const polygon of item.pref.parts) {
          const vertices = polygon.map(p => ({ x: (p.x - shape.cx) * shape.scale, y: (p.y - shape.cy) * shape.scale }));
          const center = M.Vertices.centre(vertices);
          const part = M.Body.create({ ...options, position: center, vertices: M.Vertices.hull(vertices) });
          part.prefectureId = item.pref.id;
          parts.push(part);
        }
      }
      const body = M.Body.create({ ...options, parts });
      shape.offset = { ...body.position };
      for (const item of shape.shapes) {
        item.pts = item.pts.map(p => ({ x: p.x - shape.offset.x, y: p.y - shape.offset.y }));
        item.label = M.Vertices.centre(item.pts);
      }
      M.Body.setPosition(body, { x, y });
      const group = { ids: [...ids], shape, body, born: this.time, joinAfter: this.time,
        overflowGraceUntil: this.time + 1000 };
      body.group = group;
      this.groups.push(group);
      M.Composite.add(this.engine.world, body);
      return group;
    }

    setAim(x) {
      if (!this.current) return;
      const shape = this.shape([this.current]), pts = shape.shapes[0].pts;
      const half = Math.max(20, (Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x))) / 2 + 4);
      this.aim = Math.max(half, Math.min(this.width - half, x));
    }

    drop() {
      if (this.over || this.completeAt !== null || !this.current || this.time < this.readyAt) return false;
      const id = this.current;
      const group = this.spawn([id], this.aim, 60);
      this.M.Body.setVelocity(group.body, { x: 0, y: 1.5 });
      this.used.add(id);
      this.current = null;
      this.dropped++;
      this.totalDropped++;
      this.score += DROP_SCORE;
      for (const region of this.awardRegions(group)) this.onRegionComplete?.(region, group);
      this.readyAt = this.time + 460;
      if (id === 1) this.finalWait = this.time;
      return true;
    }

    awardRegions(group) {
      const ids = new Set(group.ids), earned = [];
      for (const region of REGIONS) {
        if (this.completedRegions.has(region.id) || !region.ids.every(id => ids.has(id))) continue;
        this.completedRegions.add(region.id);
        this.score += region.bonus;
        earned.push(region);
      }
      return earned;
    }

    worldPoint(group, point) {
      const shape = group.shape, angle = group.body.angle;
      const x = (point.x - shape.cx) * shape.scale - shape.offset.x;
      const y = (point.y - shape.cy) * shape.scale - shape.offset.y;
      return { x: group.body.position.x + x * Math.cos(angle) - y * Math.sin(angle),
        y: group.body.position.y + x * Math.sin(angle) + y * Math.cos(angle) };
    }

    canJoin(a, b, counties = null) {
      if (this.time < a.joinAfter || this.time < b.joinAfter) return false;
      if (counties) return [...counties].some(pair => this.adj.has(pair));
      // Direct queries use the same county-local rule as engine contacts.
      // No prescribed border point or angle: any contact on that county works.
      for (const partA of a.body.parts.slice(1)) {
        for (const partB of b.body.parts.slice(1)) {
          if (!this.adj.has(key(partA.prefectureId, partB.prefectureId))) continue;
          if (this.M.Bounds.overlaps(partA.bounds, partB.bounds) && this.M.Collision.collides(partA, partB)) return true;
        }
      }
      return false;
    }

    overlaps(group, tolerance = 0.02) {
      const M = this.M, collisions = [];
      const parts = body => body.parts.length > 1 ? body.parts.slice(1) : [body];
      const others = [...this.walls, ...this.groups.filter(g => g !== group).map(g => g.body)];
      // Query.collides tests the assembly's convex hull and stops at the first
      // hit on each other body. A shallow hit can hide a deeply buried part.
      // Test the real convex pieces on both sides and retain the deepest hit.
      const ownParts = parts(group.body);
      for (const other of others) {
        if (!M.Bounds.overlaps(group.body.bounds, other.bounds)) continue;
        const otherParts = parts(other);
        let deepest = null;
        for (const a of ownParts) {
          if (!M.Bounds.overlaps(a.bounds, other.bounds)) continue;
          for (const b of otherParts) {
            if (!M.Bounds.overlaps(a.bounds, b.bounds)) continue;
            const collision = M.Collision.collides(a, b);
            if (collision && collision.depth > tolerance && (!deepest || collision.depth > deepest.depth)) deepest = collision;
          }
        }
        if (deepest) collisions.push(deepest);
      }
      return collisions;
    }

    placeClear(group) {
      const M = this.M, body = group.body;
      const bounds = body.bounds;
      M.Body.translate(body, { x: bounds.min.x < 2 ? 2 - bounds.min.x : bounds.max.x > this.width - 2 ? this.width - 2 - bounds.max.x : 0,
        y: bounds.max.y > this.floor - 0.05 ? this.floor - 0.05 - bounds.max.y : 0 });
      if (!this.overlaps(group).length) return 0;
      // Warp above the entire occupied column, leaving room to fall back in.
      // This cannot stop halfway inside a concavity or exhaust a scan limit.
      const margin = 6;
      let top = this.floor;
      for (const other of this.groups) {
        if (other === group || other.body.bounds.max.x < body.bounds.min.x - margin
          || other.body.bounds.min.x > body.bounds.max.x + margin) continue;
        top = Math.min(top, other.body.bounds.min.y);
      }
      const lifted = Math.max(margin, body.bounds.max.y - top + margin);
      M.Body.translate(body, { x: 0, y: -lifted });
      M.Body.setVelocity(body, { x: 0, y: 0 });
      M.Body.setAngularVelocity(body, 0);
      body.positionImpulse.x = body.positionImpulse.y = 0;
      return lifted;
    }

    wakeConnectedBodies(seeds) {
      const seen = new Set(seeds), queue = [...seeds];
      for (let index = 0; index < queue.length; index++) {
        const body = queue[index];
        this.M.Sleeping.set(body, false);
        const nearby = { min: { x: body.bounds.min.x - 2, y: body.bounds.min.y - 2 },
          max: { x: body.bounds.max.x + 2, y: body.bounds.max.y + 2 } };
        for (const group of this.groups) {
          if (seen.has(group.body) || !this.M.Bounds.overlaps(nearby, group.body.bounds)) continue;
          seen.add(group.body);
          queue.push(group.body);
        }
      }
    }

    clearRecentMerges() {
      for (const group of this.groups) {
        if (this.time >= (group.clearUntil ?? -Infinity) || !this.overlaps(group, 1).length) continue;
        // A moving pile can enter the new geometry on the next solver step.
        // Repair only the short merge transition, without keeping idle pieces
        // moving or extending their overflow grace period.
        this.wakeConnectedBodies([group.body]);
        this.placeClear(group);
        this.wakeConnectedBodies([group.body]);
      }
    }

    merge(a, b) {
      const M = this.M, anchor = a.ids.length >= b.ids.length ? a : b;
      const anchorPref = this.prefs.get(anchor.ids[0]);
      const target = this.worldPoint(anchor, anchorPref.center);
      // Removing a support must wake the connected pile; otherwise sleeping
      // bodies above it could remain suspended after the merge changes shape.
      this.wakeConnectedBodies([a.body, b.body]);
      M.Composite.remove(this.engine.world, [a.body, b.body]);
      this.groups = this.groups.filter(g => g !== a && g !== b);
      const ids = [...a.ids, ...b.ids], group = this.spawn(ids, target.x, target.y);
      M.Body.setAngle(group.body, anchor.body.angle);
      // A sideways assembly can be wider than the box despite fitting in its
      // canonical orientation. Turn it upright before finding an empty spot,
      // rather than shrinking it again or scanning up between both walls.
      if (group.body.bounds.max.x - group.body.bounds.min.x > this.width - 8) {
        M.Body.setAngle(group.body, 0);
      }
      const actual = this.worldPoint(group, anchorPref.center);
      M.Body.translate(group.body, { x: target.x - actual.x, y: target.y - actual.y });
      this.placeClear(group);
      this.wakeConnectedBodies([group.body]);
      M.Body.setVelocity(group.body, { x: 0, y: -0.6 });
      group.joinAfter = this.time + 180;
      group.overflowGraceUntil = this.time + 500;
      group.clearUntil = this.time + 450;
      const points = mergePoints(a.ids.length, b.ids.length);
      this.score += points;
      const regions = this.awardRegions(group);
      if (ids.length === 47) {
        this.score += COMPLETE_BONUS;
        this.completed++;
        this.completeAt = this.time;
        this.current = this.next = null;
        this.setShuffling(false);
        for (const region of regions) this.onRegionComplete?.(region, group);
        this.onComplete?.(this.round, COMPLETE_BONUS, group);
      } else {
        this.onMerge?.(ids.length, points, group, regions);
        for (const region of regions) this.onRegionComplete?.(region, group);
      }
      return group;
    }

    setShuffling(active) {
      const wasShuffling = this.shuffling;
      const allowed = !!active && !this.over && this.completeAt === null && this.groups.length > 0;
      if (allowed && !this.shuffling) {
        this.shuffles++;
        this.shuffleStartedAt = this.time;
        this.shuffleTargets.clear();
        this.shuffleTargetAt = -Infinity;
        // Immediate, bounded sideways jolt. Repeated presses cannot accumulate
        // launch energy, and there is no upward velocity kick.
        for (const group of this.groups) {
          const body = group.body;
          if (body.isStatic) continue;
          const motion = this.shuffleMotion(group);
          const direction = Math.sin(motion.phase) >= 0 ? 1 : -1;
          this.M.Sleeping.set(body, false);
          this.M.Body.setVelocity(body, {
            x: direction * (4.5 + this.random() * 1.2),
            y: Math.min(4, Math.max(0, body.velocity.y))
          });
          this.M.Body.setAngularVelocity(body, direction * 0.04);
        }
      }
      this.shuffling = allowed;
      if (!allowed) {
        this.shuffleStartedAt = null;
        if (wasShuffling) for (const group of this.groups) {
          if (this.shuffleLiftWeight(group) === 0 || group.body.isStatic) continue;
          const body = group.body;
          // Release starts the fall immediately, rather than coasting upwards.
          if (body.velocity.y < 0) this.M.Body.setVelocity(body, { x: body.velocity.x, y: 0 });
          body.force.y = 0;
        }
      }
      return allowed;
    }

    findShuffleTargets() {
      this.shuffleTargets.clear();
      const reach = Math.min(125, this.width * 0.23), outlines = new Map();
      for (const group of this.groups) {
        let closest = reach, targetX = 0;
        for (const other of this.groups) {
          if (group === other) continue;
          const surface = this.nearestJoinSurface(group, other, closest, outlines);
          if (surface) {
            closest = surface.distance;
            targetX = Math.max(-2.8, Math.min(2.8, (surface.pointB.x - surface.pointA.x) * 0.055));
          }
        }
        this.shuffleTargets.set(group.body.id, targetX);
      }
      this.shuffleTargetAt = this.time;
    }

    shuffleStrength() {
      if (!this.shuffling || this.shuffleStartedAt === null) return 1;
      const elapsed = Math.max(0, this.time - this.shuffleStartedAt);
      return 1 + Math.log1p(elapsed / 2000) * 0.85;
    }

    shuffleMotion(group) {
      if (group.shuffleMotion?.press === this.shuffles) return group.shuffleMotion;
      // Pick independent rhythms once per press, rather than adding noisy
      // random impulses every physics frame. Newly merged pieces get their own.
      return group.shuffleMotion = {
        press: this.shuffles,
        phase: this.random() * Math.PI * 2,
        swingPeriod: 65 + this.random() * 45,
        rattlePeriod: 18 + this.random() * 17,
        knockPeriod: 140 + this.random() * 120,
        knockOffset: this.random() * 260,
        spinPeriod: 45 + this.random() * 45
      };
    }

    shuffleLiftWeight(group) {
      // Single counties float freely; each joined county adds weight until
      // thirty counties retain the existing heavy-assembly shake behavior.
      return Math.max(0, (30 - group.ids.length) / 29);
    }

    buoyantLiftAcceleration(group) {
      const body = group.body;
      group.liftRadius ??= Math.max(...body.vertices.map(p => Math.hypot(p.x - body.position.x, p.y - body.position.y)));
      // A circumscribed radius reserves room for rotation below the top line.
      const hoverY = this.rim + 24 + group.liftRadius;
      const targetY = Math.max(-6, Math.min(7, (hoverY - body.position.y) * 0.065));
      return (targetY - body.velocity.y) * 0.0018 - this.engine.gravity.y * this.engine.gravity.scale;
    }

    shakeStep() {
      const M = this.M;
      const elapsed = this.time - (this.shuffleStartedAt ?? this.time);
      const cycle = elapsed % 2400;
      const settling = cycle >= 1500;
      const strength = this.shuffleStrength();
      const spread = Math.min(1, Math.max(0, elapsed - 2400) / 5000);
      if (settling && this.time - this.shuffleTargetAt >= 150) this.findShuffleTargets();
      for (const group of this.groups) {
        const body = group.body;
        if (body.isStatic) continue;
        M.Sleeping.set(body, false);
        const motion = this.shuffleMotion(group);
        const knockTime = elapsed + motion.knockOffset;
        const knockDirection = Math.sin(Math.floor(knockTime / motion.knockPeriod) * 2.399 + motion.phase) >= 0 ? 1 : -1;
        const knock = knockDirection * 5 * Math.exp(-(knockTime % motion.knockPeriod) / 35);
        const rack = Math.sin(elapsed / motion.swingPeriod + motion.phase) * 9
          + Math.sin(elapsed / motion.rattlePeriod + motion.phase * 1.71) * 3 + knock;
        let targetX, spin;
        if (cycle < 700) {
          // Each piece shakes on its own rhythm to break static friction.
          targetX = rack;
          spin = Math.sin(elapsed / motion.spinPeriod + motion.phase) * 0.065;
        } else if (!settling) {
          // Shear layers in different directions and roll interlocked shapes.
          targetX = rack + Math.sin((cycle - 700) / motion.swingPeriod + motion.phase * 1.3) * 2.2;
          spin = Math.sin(elapsed / motion.spinPeriod + motion.phase * 1.5) * 0.075;
        } else {
          // Keep rattling during the gathering phase, with a local nudge
          // toward real neighbors rather than a long, nearly motionless pause.
          const gather = (this.shuffleTargets.get(body.id) || 0)
            + (this.width / 2 - body.position.x) / this.width * 1.2;
          targetX = rack * 0.85 + gather * (1 - spread);
          spin = Math.sin(elapsed / motion.spinPeriod + motion.phase * 1.8) * 0.045;
        }
        const phase = body.id * 2.399;
        const outward = Math.max(-1, Math.min(1, (body.position.x - this.width / 2) / (this.width / 2)));
        // The hold's envelope keeps growing across shake-mode cycles. Each
        // piece gains its own phase so the pile spreads instead of translating
        // as one body. Releasing the button resets this envelope.
        targetX = targetX * strength + spread * strength
          * (Math.sin(elapsed / motion.rattlePeriod + motion.phase) * 2 + outward * 1.4);
        spin = Math.max(-0.16, Math.min(0.16, spin * strength
          + Math.sin(elapsed / motion.rattlePeriod + motion.phase * 2) * strength * 0.035));
        // Keep vertical shaking, but favor settling over launching pieces.
        // Upward force fades out near the overflow line and stays bounded
        // even when a long hold makes the horizontal shaking much stronger.
        const verticalWave = Math.sin(elapsed / 110) * 0.65
          + Math.sin(elapsed / 145 + phase) * 0.35;
        const targetY = verticalWave * (4 + spread * 2.5) * strength;
        const liftFade = Math.max(0, Math.min(1, (body.bounds.min.y - this.rim) / 90));
        // Let small pieces escape gaps in the pile without lifting large
        // assemblies more strongly. The overflow-line taper still applies.
        const liftBoost = 1 + 1.2 * Math.max(0, Math.min(1, (5000 - body.area) / 3500));
        const verticalForce = (targetY - body.velocity.y * 0.25) * 0.0008;
        const assemblyAcceleration = verticalForce < 0
          ? Math.max(-0.0012, verticalForce * 0.25) * liftFade * liftBoost
          : verticalForce;
        const liftWeight = this.shuffleLiftWeight(group);
        const verticalAcceleration = assemblyAcceleration * (1 - liftWeight)
          + (liftWeight > 0 ? this.buoyantLiftAcceleration(group) * liftWeight : 0);
        const gain = settling ? 0.001 : 0.0013;
        M.Body.applyForce(body, body.position, {
          x: body.mass * (targetX - body.velocity.x) * gain,
          y: body.mass * verticalAcceleration
        });
        M.Body.setAngularVelocity(body, body.angularVelocity + (spin - body.angularVelocity) * 0.22);
      }
    }

    checkOverflow() {
      // Only a newly introduced body has a short, fixed grace period. Holding
      // shuffle, movement speed, and repeated shakes never extend it.
      const overflow = this.groups.some(group => this.time >= group.overflowGraceUntil
        && group.body.vertices.some(vertex => vertex.y < this.rim - 1));
      if (overflow) {
        this.overSince ??= this.time;
        if (this.time - this.overSince >= OVERFLOW_MS) this.finish('overflow');
      } else this.overSince = null;
    }

    nearestJoinSurface(a, b, reach = 50, outlines = new Map()) {
      const outline = (group, id) => {
        if (!outlines.has(group)) outlines.set(group, new Map());
        const counties = outlines.get(group);
        if (!counties.has(id)) {
          const points = this.prefs.get(id).pts.map(point => this.worldPoint(group, point));
          counties.set(id, { points, bounds: this.M.Bounds.create(points) });
        }
        return counties.get(id);
      };
      let closest = null, distance = reach;
      for (const idA of a.ids) for (const idB of b.ids) {
        // This is the same adjacency rule used by county-local collision merges.
        if (!this.adj.has(key(idA, idB))) continue;
        const countyA = outline(a, idA), countyB = outline(b, idB);
        const nearby = { min: { x: countyA.bounds.min.x - distance, y: countyA.bounds.min.y - distance },
          max: { x: countyA.bounds.max.x + distance, y: countyA.bounds.max.y + distance } };
        if (!this.M.Bounds.overlaps(nearby, countyB.bounds)) continue;
        const surface = closestSurface(countyA.points, countyB.points, distance);
        if (surface) { closest = { ...surface, idA, idB }; distance = surface.distance; }
      }
      return closest;
    }

    applyNeighborAttraction() {
      // Attraction is manual: let the pile settle naturally after release.
      if (!this.shuffling) return;
      const candidates = [], reach = 50, outlines = new Map();
      const pull = 15 * Math.min(1.6, Math.sqrt(this.shuffleStrength()));
      for (let i = 0; i < this.groups.length; i++) {
        const a = this.groups[i];
        const nearby = { min: { x: a.body.bounds.min.x - reach, y: a.body.bounds.min.y - reach },
          max: { x: a.body.bounds.max.x + reach, y: a.body.bounds.max.y + reach } };
        for (let j = i + 1; j < this.groups.length; j++) {
          const b = this.groups[j];
          if ((a.body.isStatic && b.body.isStatic) || (a.body.isSleeping && b.body.isSleeping)) continue;
          if (!this.M.Bounds.overlaps(nearby, b.body.bounds)) continue;
          const surface = this.nearestJoinSurface(a, b, reach, outlines);
          if (surface && surface.distance > 0.02) candidates.push({ a, b, ...surface });
        }
      }
      // One connection per assembly prevents several neighbors from adding up
      // to a large impulse or pulling an assembly in conflicting directions.
      candidates.sort((a, b) => a.distance - b.distance);
      const paired = new Set();
      for (const { a, b, pointA, pointB, distance } of candidates) {
        if (paired.has(a) || paired.has(b)) continue;
        paired.add(a); paired.add(b);
        const mass = Math.min(a.body.mass, b.body.mass);
        const magnitude = Math.min(0.0003, 0.00008 + distance * 0.000014) * mass * pull * 2;
        const force = { x: (pointB.x - pointA.x) / distance * magnitude,
          y: (pointB.y - pointA.y) / distance * magnitude };
        // Pull at the actual county surfaces that can collide and merge,
        // including rotated pieces and counties at the end of a large assembly.
        if (!a.body.isStatic) this.M.Body.applyForce(a.body, pointA, force);
        if (!b.body.isStatic) this.M.Body.applyForce(b.body, pointB, { x: -force.x, y: -force.y });
      }
    }

    finish(reason) { this.over = true; this.endReason = reason; this.setShuffling(false); }

    nextRound() {
      if (this.over || this.completeAt === null) return false;
      this.round++;
      this.beginRound();
      this.onRound?.(this.round);
      return true;
    }

    step(ms = 1000 / 60) {
      if (this.over) return;
      this.time += ms;
      // Keep the completed map and celebration until the player continues.
      if (this.completeAt !== null) return;
      // This deadline cannot be extended by shuffle or overlap protection.
      if (this.finalWait !== null && this.time - this.finalWait >= FINAL_LIMIT_MS) {
        this.finish('timeout');
        return;
      }
      if (this.shuffling) this.shakeStep();
      this.applyNeighborAttraction();
      for (let substep = 0; substep < 2; substep++) {
        // Engine.update clears forces each substep. Sustain the buoyant part
        // through both halves, preserving the old shake at thirty counties.
        if (substep === 1 && this.shuffling) for (const group of this.groups) {
          const liftWeight = this.shuffleLiftWeight(group);
          if (liftWeight > 0 && !group.body.isStatic) this.M.Body.applyForce(group.body, group.body.position,
            { x: 0, y: group.body.mass * this.buoyantLiftAcceleration(group) * liftWeight });
        }
        this.contacts.clear();
        this.M.Engine.update(this.engine, ms / 2);
        for (const group of this.groups) {
          const v = group.body.velocity;
          const limit = this.shuffling ? Math.min(20, 12 * this.shuffleStrength()) : 12;
          if (Math.abs(v.y) > limit || Math.abs(v.x) > limit) {
            this.M.Body.setVelocity(group.body, {
              x: Math.max(-limit, Math.min(limit, v.x)), y: Math.max(-limit, Math.min(limit, v.y))
            });
          }
        }
        for (const { a, b, counties } of this.contacts.values()) {
          if (!this.groups.includes(a) || !this.groups.includes(b) || !this.canJoin(a, b, counties)) continue;
          this.merge(a, b);
          break;
        }
        if (this.completeAt !== null) return;
        this.clearRecentMerges();
      }
      if (!this.current && this.time >= this.readyAt && this.next) {
        this.current = this.next;
        this.next = this.takeNext();
        this.setAim(this.aim);
      }
      this.checkOverflow();
    }
  }

  root.PuzzleCore = { Puzzle, FINAL_LIMIT_MS, OVERFLOW_MS,
    DROP_SCORE, ROUND_SCORE, COMPLETE_BONUS, mergePoints, REGIONS, REGION_BONUS_TOTAL };
  if (typeof module === 'object') module.exports = root.PuzzleCore;
})(typeof window === 'object' ? window : globalThis);
