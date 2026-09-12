'use strict';

const { join } = require('path');
module.paths.push(join(Editor.App.path, 'node_modules'));

exports.load = function load() {};
exports.unload = function unload() {};

exports.methods = {
  sceneSummary(options) {
    const { director } = require('cc');
    const scene = director.getScene();
    return {
      ok: true,
      scene: scene ? serializeNode(scene, 0, options && options.maxDepth || 8) : null,
    };
  },
  nodeDetail(options) {
    const { director } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const node = findNode(scene, options && (options.uuid || options.path || options.name));
    if (!node) return { ok: false, error: 'Node not found.' };
    return {
      ok: true,
      node: serializeNode(node, 0, options && options.maxDepth || 2),
    };
  },
  createNode(options) {
    const { director, Node, Vec3 } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const parent = findNode(scene, options && (options.parentUuid || options.parentPath)) || scene;
    const node = new Node(options && options.name || 'Codex Node');
    parent.addChild(node);
    if (options && options.position) {
      node.setPosition(new Vec3(options.position.x || 0, options.position.y || 0, options.position.z || 0));
    }
    if (options && options.scale) {
      node.setScale(new Vec3(options.scale.x ?? 1, options.scale.y ?? 1, options.scale.z ?? 1));
    }
    if (options && typeof options.active === 'boolean') {
      node.active = options.active;
    }
    return { ok: true, node: serializeNode(node, 0, 2), parent: serializeNode(parent, 0, 1) };
  },
  setNode(options) {
    const { director, Vec3 } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const node = findNode(scene, options && (options.uuid || options.path));
    if (!node) return { ok: false, error: 'Node not found.' };
    if (options.name) node.name = options.name;
    if (typeof options.active === 'boolean') node.active = options.active;
    if (options.position) node.setPosition(new Vec3(options.position.x || 0, options.position.y || 0, options.position.z || 0));
    if (options.scale) node.setScale(new Vec3(options.scale.x ?? 1, options.scale.y ?? 1, options.scale.z ?? 1));
    return { ok: true, node: serializeNode(node, 0, 2) };
  },
  addComponent(options) {
    const { director } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const node = findNode(scene, options && (options.uuid || options.path));
    if (!node) return { ok: false, error: 'Node not found.' };
    const type = options && options.type;
    const ctor = resolveComponentConstructor(type);
    if (!ctor) return { ok: false, error: 'Unknown component type: ' + type + '. Make sure custom scripts are imported and compiled.' };
    const component = node.getComponent(ctor) || node.addComponent(ctor);
    return {
      ok: true,
      node: serializeNode(node, 0, 1),
      component: {
        uuid: component.uuid,
        type,
        name: component.name,
      },
    };
  },
  setComponentAssetProperty(options) {
    const { director, assetManager } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const node = findNode(scene, options && (options.nodeUuid || options.nodePath || options.path));
    if (!node) return { ok: false, error: 'Node not found.' };
    const component = findComponent(node, options && (options.componentUuid || options.componentType || options.componentName));
    if (!component) return { ok: false, error: 'Component not found.' };
    const property = options && options.property;
    const uuid = options && (options.assetUuid || options.uuid);
    if (!property || property.includes('.')) return { ok: false, error: 'Only direct component asset properties are supported by this route.' };
    if (!uuid) return { ok: false, error: 'assetUuid is required.' };
    return new Promise((resolve) => {
      assetManager.loadAny({ uuid }, (error, asset) => {
        if (error) {
          resolve({ ok: false, error: error.message || String(error), uuid });
          return;
        }
        component[property] = asset;
        resolve({
          ok: true,
          node: serializeNode(node, 0, 1),
          component: {
            uuid: component.uuid,
            name: component.name,
            type: component.constructor && component.constructor.name,
            property,
            assetUuid: uuid,
            assetName: asset && asset.name,
          },
        });
      });
    });
  },
  setComponentAssetArrayProperty(options) {
    const { director } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const node = findNode(scene, options && (options.nodeUuid || options.nodePath || options.path));
    if (!node) return { ok: false, error: 'Node not found.' };
    const component = findComponent(node, options && (options.componentUuid || options.componentType || options.componentName));
    if (!component) return { ok: false, error: 'Component not found.' };
    const property = options && options.property;
    const uuids = options && (options.assetUuids || options.uuids);
    if (!property || property.includes('.')) return { ok: false, error: 'Only direct component asset array properties are supported by this route.' };
    if (!Array.isArray(uuids) || uuids.length === 0) return { ok: false, error: 'assetUuids must be a non-empty array.' };
    return new Promise((resolve) => {
      Promise.all(uuids.map((uuid) => loadAssetByUuid(uuid))).then((results) => {
        const failed = results
          .map((result, index) => ({ result, index, uuid: uuids[index] }))
          .filter((entry) => !entry.result.ok);
        if (failed.length > 0) {
          resolve({
            ok: false,
            error: 'One or more assets failed to load.',
            failed: failed.map((entry) => ({ index: entry.index, uuid: entry.uuid, error: entry.result.error })),
          });
          return;
        }
        const assets = results.map((result) => result.asset);
        component[property] = assets;
        resolve({
          ok: true,
          node: serializeNode(node, 0, 1),
          component: {
            uuid: component.uuid,
            name: component.name,
            type: component.constructor && component.constructor.name,
            property,
            count: assets.length,
            assetUuids: uuids,
            assetNames: assets.map((asset) => asset && asset.name),
          },
        });
      }).catch((error) => {
        resolve({ ok: false, error: error && error.stack ? error.stack : String(error) });
      });
    });
  },
  setComponentProperty(options) {
    const { director } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const node = findNode(scene, options && (options.nodeUuid || options.nodePath || options.path));
    if (!node) return { ok: false, error: 'Node not found.' };
    const component = findComponent(node, options && (options.componentUuid || options.componentType || options.componentName));
    if (!component) return { ok: false, error: 'Component not found.' };
    const property = options && options.property;
    if (!property || property.includes('.')) return { ok: false, error: 'Only direct component properties are supported by this route.' };
    component[property] = options.value;
    return {
      ok: true,
      node: serializeNode(node, 0, 1),
      component: {
        uuid: component.uuid,
        name: component.name,
        type: component.constructor && component.constructor.name,
        property,
        value: component[property],
      },
    };
  },
  async applyBlueprint(options) {
    const { director } = require('cc');
    const scene = director.getScene();
    if (!scene) return { ok: false, error: 'No active scene.' };
    const blueprint = options && options.blueprint ? options.blueprint : options || {};
    const nodes = Array.isArray(blueprint.nodes) ? blueprint.nodes : [];
    const actions = [];
    const warnings = [];
    for (const spec of nodes) {
      const node = ensureNodePath(scene, spec && (spec.path || makeChildPath(spec.parentPath, spec.name)), actions);
      if (!node) {
        warnings.push({ node: spec && (spec.path || spec.name), error: 'Node path is required.' });
        continue;
      }
      applyNodeOptions(node, spec || {});
      const components = Array.isArray(spec.components) ? spec.components : [];
      for (const componentSpec of components) {
        const result = await applyBlueprintComponent(scene, node, componentSpec || {});
        actions.push(...result.actions);
        warnings.push(...result.warnings);
      }
    }
    for (const spec of nodes) {
      const node = findNode(scene, spec && (spec.path || makeChildPath(spec.parentPath, spec.name)));
      if (!node) continue;
      const components = Array.isArray(spec.components) ? spec.components : [];
      for (const componentSpec of components) {
        const result = await applyBlueprintComponentReferences(scene, node, componentSpec || {});
        actions.push(...result.actions);
        warnings.push(...result.warnings);
      }
    }
    return {
      ok: warnings.length === 0,
      name: blueprint.name,
      nodesProcessed: nodes.length,
      actions,
      warnings,
      scene: serializeNode(scene, 0, 2),
    };
  },
};

async function applyBlueprintComponent(scene, node, spec) {
  const actions = [];
  const warnings = [];
  const type = spec.type;
  const ctor = resolveComponentConstructor(type);
  if (!ctor) {
    warnings.push({ node: getPath(node), component: type, error: 'Unknown component type. Make sure scripts are imported and compiled.' });
    return { actions, warnings };
  }
  const component = node.getComponent(ctor) || node.addComponent(ctor);
  actions.push({ action: 'ensure-component', node: getPath(node), type });

  if (spec.properties && typeof spec.properties === 'object') {
    for (const [property, value] of Object.entries(spec.properties)) {
      if (property.includes('.')) {
        warnings.push({ node: getPath(node), component: type, property, error: 'Nested component properties are not supported.' });
        continue;
      }
      component[property] = value;
      actions.push({ action: 'set-component-property', node: getPath(node), type, property });
    }
  }

  return { actions, warnings };
}

async function applyBlueprintComponentReferences(scene, node, spec) {
  const actions = [];
  const warnings = [];
  const type = spec.type;
  const ctor = resolveComponentConstructor(type);
  if (!ctor) {
    warnings.push({ node: getPath(node), component: type, error: 'Unknown component type. Make sure scripts are imported and compiled.' });
    return { actions, warnings };
  }
  const component = node.getComponent(ctor);
  if (!component) {
    warnings.push({ node: getPath(node), component: type, error: 'Component not found for reference assignment.' });
    return { actions, warnings };
  }

  if (spec.nodeProperties && typeof spec.nodeProperties === 'object') {
    for (const [property, nodePath] of Object.entries(spec.nodeProperties)) {
      if (property.includes('.')) {
        warnings.push({ node: getPath(node), component: type, property, error: 'Nested component properties are not supported.' });
        continue;
      }
      const target = findNode(scene, nodePath);
      if (!target) {
        warnings.push({ node: getPath(node), component: type, property, target: nodePath, error: 'Target node not found.' });
        continue;
      }
      component[property] = target;
      actions.push({ action: 'set-component-node-property', node: getPath(node), type, property, target: getPath(target) });
    }
  }

  if (spec.assetProperties && typeof spec.assetProperties === 'object') {
    for (const [property, uuid] of Object.entries(spec.assetProperties)) {
      if (property.includes('.')) {
        warnings.push({ node: getPath(node), component: type, property, error: 'Nested component properties are not supported.' });
        continue;
      }
      const result = await loadAssetByUuid(uuid);
      if (!result.ok) {
        warnings.push({ node: getPath(node), component: type, property, uuid, error: result.error });
        continue;
      }
      component[property] = result.asset;
      actions.push({ action: 'set-component-asset-property', node: getPath(node), type, property, uuid });
    }
  }

  return { actions, warnings };
}

function makeChildPath(parentPath, name) {
  if (!parentPath || !name) return null;
  return String(parentPath).replace(/\/+$/, '') + '/' + name;
}

function ensureNodePath(scene, path, actions) {
  if (!path) return null;
  const { Node } = require('cc');
  const segments = splitScenePath(scene, path);
  let current = scene;
  for (const segment of segments) {
    let child = current.children.find((candidate) => candidate.name === segment);
    if (!child) {
      child = new Node(segment);
      current.addChild(child);
      actions.push({ action: 'create-node', path: getPath(child) });
    }
    current = child;
  }
  return current;
}

function splitScenePath(scene, path) {
  const segments = String(path).split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments[0] === scene.name || segments[0] === 'Scene') {
    return segments.slice(1);
  }
  return segments;
}

function applyNodeOptions(node, options) {
  const { Vec3 } = require('cc');
  if (options.name && node.name !== options.name) node.name = options.name;
  if (typeof options.active === 'boolean') node.active = options.active;
  if (options.position) {
    node.setPosition(new Vec3(options.position.x || 0, options.position.y || 0, options.position.z || 0));
  }
  if (options.scale) {
    node.setScale(new Vec3(options.scale.x ?? 1, options.scale.y ?? 1, options.scale.z ?? 1));
  }
}

function loadAssetByUuid(uuid) {
  const { assetManager } = require('cc');
  return new Promise((resolve) => {
    assetManager.loadAny({ uuid }, (error, asset) => {
      if (error) {
        resolve({ ok: false, error: error.message || String(error) });
        return;
      }
      resolve({ ok: true, asset });
    });
  });
}

function serializeNode(node, depth, maxDepth) {
  return {
    uuid: node.uuid,
    name: node.name,
    path: getPath(node),
    siblingIndex: node.getSiblingIndex ? node.getSiblingIndex() : undefined,
    active: node.active,
    position: { x: node.position.x, y: node.position.y, z: node.position.z },
    scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
    components: node.components.map((component) => ({
      uuid: component.uuid,
      name: component.name,
      type: component.constructor && component.constructor.name,
    })),
    children: depth >= maxDepth ? [] : node.children.map((child) => serializeNode(child, depth + 1, maxDepth)),
  };
}

function getPath(node) {
  const names = [];
  let current = node;
  while (current) {
    names.push(current.name);
    current = current.parent;
  }
  return names.reverse().join('/');
}

function findNode(scene, query) {
  if (!query) return null;
  const normalizedQuery = normalizeSceneQuery(scene, query);
  if (normalizedQuery === scene.uuid || normalizedQuery === scene.name || normalizedQuery === getPath(scene)) return scene;
  const queue = [scene];
  while (queue.length) {
    const node = queue.shift();
    if (node.uuid === normalizedQuery || getPath(node) === normalizedQuery) return node;
    queue.push(...node.children);
  }
  return null;
}

function normalizeSceneQuery(scene, query) {
  const value = String(query);
  if (value === 'Scene') return scene.name;
  if (value.startsWith('Scene/')) return scene.name + value.slice('Scene'.length);
  return value;
}

function findComponent(node, query) {
  if (!query) return null;
  return node.components.find((component) => {
    const ctorName = component.constructor && component.constructor.name;
    return component.uuid === query || component.name === query || ctorName === query;
  }) || null;
}

function resolveComponentConstructor(type) {
  if (!type) return null;
  const cc = require('cc');
  if (cc[type]) return cc[type];
  if (cc.js && typeof cc.js.getClassByName === 'function') {
    const ctor = cc.js.getClassByName(type);
    if (ctor) return ctor;
  }
  return null;
}

Object.assign(exports.methods, require('./m0-hooks'));
