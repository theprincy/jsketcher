import {checkForSelectedFaces} from './actions/actionHelpers'
import {nurbsToThreeGeom, triangulateToThree} from './scene/wrappers/brepSceneObject'
import {createSolidMaterial} from './scene/wrappers/sceneObject'
import DPR from 'dpr'
import Vector from 'math/vector';
import * as ui from '../ui/ui';

import React from 'react';
import ReactDOM from 'react-dom';
import BrepDebugger from './../brep/debug/debugger/brepDebugger';
import {TOKENS as UI_TOKENS} from "./dom/uiEntryPointsPlugin";
import {IO} from '../sketcher/io';
import {readSketchFloat} from './sketch/sketchReader';
import {TOKENS as CRAFT_TOKENS} from './craft/craftPlugin';
import {toLoops} from '../brep/brep-io';


export function activate({bus, services}) {
  addGlobalDebugActions(services);
  services.action.registerActions(DebugActions);
  services.menu.registerMenus([DebugMenuConfig]);
  bus.updateState(UI_TOKENS.CONTROL_BAR_LEFT, actions => [...actions, 'menu.debug']);
}

function addGlobalDebugActions({viewer, cadScene, cadRegistry}) {
  const debugGroup = new THREE.Object3D();
  const debugVolumeGroup = new THREE.Object3D();

  cadScene.auxGroup.add(debugGroup);
  cadScene.auxGroup.add(debugVolumeGroup);
  window.__DEBUG__ = {
    flag: 0, 
    AddLine: (a, b) => {
      debugGroup.add(createLine(a, b));
      viewer.render();
    },
    AddSegment: (a, b, color) => {
      __DEBUG__.AddPolyLine([a, b], color);
    },
    AddPolyLine: (points, color) => {
      for (let i = 1; i < points.length; ++i) {
        debugGroup.add(createLine(points[i - 1], points[i], color));
      }
      debugGroup.add(createPoint(points[0], 0x000088));
      debugGroup.add(createPoint(points[points.length - 1], 0x880000));
      viewer.render();
    },
    AddPoint: (coordinates, or, vector, andColorAtTheEnd) => {
      debugGroup.add(createPoint(coordinates, or, vector, andColorAtTheEnd));
      viewer.render();
    },
    AddPoint3: (arr, color) => {
      __DEBUG__.AddPoint(arr[0], arr[1], arr[2], color);
    },
    AddVertex: (v) => {
      window.__DEBUG__.AddPoint(v.point);
    },
    AddPolygon: (vertices, color) => {
      for (let i = 0; i < vertices.length; i ++) {
        __DEBUG__.AddSegment(vertices[i].point, vertices[(i + 1) % vertices.length].point, color);
      }  
    },
    AddPointPolygon: (points, color) => {
      for (let i = 0; i < points.length; i ++) {
        __DEBUG__.AddSegment(points[i], points[(i + 1) % points.length], color);
      }
    },

    AddPointPolygons: (polygons, color) => {
      for (let points of polygons) {
        for (let i = 0; i < points.length; i ++) {
          debugGroup.add(createLine(points[i], points[(i + 1) % points.length], color));
        }
      }
      viewer.render();
    },

    AddPlane: (plane) => {
      const geo = new THREE.PlaneBufferGeometry(2000, 2000, 8, 8);
      const coplanarPoint = plane.normal.multiply(plane.w);
      const focalPoint = coplanarPoint.plus(plane.normal);
      geo.lookAt(focalPoint.three());
      geo.translate(coplanarPoint.x, coplanarPoint.y, coplanarPoint.z);
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3, });
      const planeObj = new THREE.Mesh(geo, mat);
      debugGroup.add(planeObj);
      viewer.render();
    },
    AddHalfEdge: (he, color) => {
      const points = he.edge.curve.tessellate();
      if (he.inverted) {
        points.reverse();
      }
      window.__DEBUG__.AddPolyLine(points, color);  
    },
    AddFace: (face, color) => {
      for (let e of face.edges) __DEBUG__.AddHalfEdge(e, color);
    },
    AddLoop: (loop, color) => {
      for (let e of loop.halfEdges) __DEBUG__.AddHalfEdge(e, color);
    },
    AddVolume: (shell, color) => {
      color = color || 0xffffff;
      const geometry = new THREE.Geometry();
      triangulateToThree(shell, geometry);
      const mesh = new THREE.Mesh(geometry, createSolidMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false, 
        depthTest: false
      }));
      debugVolumeGroup.add(mesh);
      // window.__DEBUG__.AddWireframe(shell, color);
      viewer.render();
    },
    AddWireframe: (shell, color) => {
      color = color || 0xffffff;
      const visited = new Set();
      for (let e of shell.edges) {
        let lg = new THREE.Geometry();
        lg.vertices.push(e.halfEdge1.vertexA.point.three());
        lg.vertices.push(e.halfEdge2.vertexA.point.three());
        const line = new THREE.Line(lg,  new THREE.LineBasicMaterial({color, linewidth: 3/DPR}));
        debugVolumeGroup.add(line);
      }
      viewer.render();
    },
    AddNurbs: (nurbs, color) => {
      color = color || 0xffffff;
      const geometry = new THREE.Geometry();
      nurbsToThreeGeom(nurbs.verb, geometry);
      geometry.computeFaceNormals();
      const mesh = new THREE.Mesh(geometry, createSolidMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      }));
      debugVolumeGroup.add(mesh);
      viewer.render();
    },
    AddCurve: (curve, color) => {
      __DEBUG__.AddPolyLine( curve.tessellate(), color);
    },
    AddVerbCurve: (curve, color) => {
      __DEBUG__.AddPolyLine(curve.tessellate().map(p => new Vector().set3(p)), color);
    },
    AddNurbsCorners: (nurbs) => {
      __DEBUG__.AddPoint(nurbs.point(0, 0), 0xff0000);
      __DEBUG__.AddPoint(nurbs.point(1, 0), 0x00ff00);
      __DEBUG__.AddPoint(nurbs.point(1, 1), 0x0000ff);
      __DEBUG__.AddPoint(nurbs.point(0, 1), 0x00ffff);
    },
    AddNormal: (atPoint, normal, color, scale) => {
      scale = scale || 100;
      __DEBUG__.AddSegment(atPoint, atPoint.plus(normal.multiply(scale)), color);
    },
    AddSurfaceNormal: (surface) => {     
      __DEBUG__.AddNormal(surface.point(0.5, 0.5), surface.normalInMiddle());
    },
    HideSolids: () => {
      cadRegistry.getAllShells().forEach(s => s.cadGroup.traverse(o => o.visible = false));
      viewer.render();
    },
    ShowSolids: () => {
      cadRegistry.getAllShells().forEach(s => s.cadGroup.traverse(o => o.visible = true));
      viewer.render();
    },
    Clear: () => {
      clearGroup(debugGroup);
      viewer.render();
    },
    ClearVolumes: () => {
      clearGroup(debugVolumeGroup);
      viewer.render();
    },
    render: () => viewer.render()
  }
}

function clearGroup(g) {
  while (g.children.length) {
    const o = g.children[0];
    o.material.dispose();
    o.geometry.dispose();
    g.remove(o);
  }
}

export function createLine(a, b, color) {
  color = color || 0xFA8072;
  const debugLineMaterial = new THREE.LineBasicMaterial({color, linewidth: 10});
  const  lg = new THREE.Geometry();
  lg.vertices.push(a.three());
  lg.vertices.push(b.three());
  return new THREE.Line(lg, debugLineMaterial);
}

export function createPoint(x, y, z, color) {
  if (z === undefined) {
    color = y;
    y = x.y;
    z = x.z;
    x = x.x;
  }
  color = color || 0x00ff00;
  let geometry = new THREE.SphereGeometry( 5, 16, 16 );
  let material = new THREE.MeshBasicMaterial( {color} );
  let sphere = new THREE.Mesh(geometry, material);
  sphere.position.x = x;
  sphere.position.y = y;
  sphere.position.z = z;
  return sphere;
}

const DebugMenuConfig = {
  id: 'debug',
  label: 'debug',
  cssIcons: ['bug'],
  info: 'set of debug actions',
  actions: ['DebugPrintAllSolids', 'DebugPrintFace', 'DebugFaceId', 'DebugFaceSketch', 
    'DebugSetSketcherIntegerPrecision', 'DebugOpenLastTest', 'DebugGenerateTest', 'DebugOpenBrepDebugger']
};

const DebugActions = [
  {
    id: 'DebugPrintAllSolids',
    appearance: {
      cssIcons: ['cutlery'],
      label: 'print all solids',
      info: 'print all solids from the proejct as JSON'
    },
    invoke: ({services:{cadRegistry}}) => {
      cadRegistry.getAllShells().map(function (o) {
        console.log("Solid ID: " + o.tCadId);
      });
    }
  },

  {
    id: 'DebugPrintFace',
    appearance: {
      cssIcons: ['cutlery'],
      label: 'print face',
      info: 'print a face out as JSON',
    },
    listens: ['selection_face'],
    update: checkForSelectedFaces(1),
    invoke: ({selection}) => {
      let s = selection.face()[0];
      console.log(JSON.stringify({
        polygons: s.csgGroup.polygons,
        basis: s._basis
      }));
    }
  },

  {
    id: 'DebugFaceId',
    appearance: {
      cssIcons: ['cutlery'],
      label: 'print face id',
      info: 'print a face id',
    },
    listens: ['selection_face'],
    update: checkForSelectedFaces(1),
    invoke: ({selection}) => {
      console.log(selection.face()[0].id);
    }
  },
  
  {
    id: 'DebugFaceSketch',
    appearance: {
      cssIcons: ['cutlery'],
      label: 'print face sketch',
      info: 'print face sketch stripping constraints and boundary',
    },
    listens: ['selection_face'],
    update: checkForSelectedFaces(1),
    invoke: ({selection, project}) => {
      const faceId = selection.face()[0].id;
      const sketch = JSON.parse(localStorage.getItem(project.faceStorageKey(faceId)));
      const layers = sketch.layers.filter(l => l.name !== '__bounds__');
      const data = [];
      for (let l of layers) {
        for (let d of l.data) {
          data.push(d);
        }
      }
      const squashed = {
        layers: [{
            name: 'sketch',
            data
          }]
      };
      console.log(JSON.stringify(squashed));
    }
  },
  {
    id: 'DebugSetSketcherIntegerPrecision',
    appearance: {
      cssIcons: ['gear'],
      label: 'set sketch precision to 0(integer)',
      info: 'all points and other parameters from sketches will be rounded to integer, useful for creating topological tests',
    },
    invoke: () => {
      let url = window.location.href;
      if (url.indexOf('sketchPrecision') !== -1) {
        url = url.replace(/sketchPrecision=\d+/, 'sketchPrecision=0');  
      } else {
        if (url.indexOf('?') !== -1) {
          url += '&';
        } else {
          url += '?';
        }
        url += 'sketchPrecision=0';
      }
      window.location.href = url;
    }
  },
  {
    id: 'DebugOpenLastTest',
    appearance: {
      cssIcons: ['gear'],
      label: 'open last test',
      info: 'open test project with the data generated by the latest executed unit test',
    },
    invoke: ({bus, services: {project, storage, sketcher, cadRegistry}}) => {
      window.location.href = '/index.html?$$$__test__$$$';
    }
  },
  {
    id: 'DebugGenerateTest',
    appearance: {
      cssIcons: ['gear'],
      label: 'generate unit test',
      info: 'it will generate a unit code code containing sketches and operation sequence and output it to terminal',
    },
    invoke: ({bus, services: {project, storage, sketcher, cadRegistry}}) => {
      
      const pt = ({x, y}) => [x, y];  
      
      let sketches = sketcher.getAllSketches().reduce((sketches, {id, url}) => {
        let sketch = sketcher.readSketch(id).getAllObjects().reduce((byType, obj) => {

          let type = obj.constructor.name;
          
          let arr = byType[type];
          if (!arr) {
            arr = [];
            byType[type] = arr;
          }
          
          if (type === 'Segment' ){
            arr.push([pt(obj.a), pt(obj.b)]);
          } else {
            throw 'unsupported ' + type;
          }
          return byType;
        }, {});
        sketches[id] = sketch;
        return sketches;
      }, {});

      let testMetadata = {
        name: project.id,
        state: {
          sketches,
          operations: bus.state[CRAFT_TOKENS.MODIFICATIONS].history
        },
        expected: toLoops(cadRegistry.getAllShells()[0].shell, readSketchFloat)
      };
      console.log(JSON.stringify(testMetadata));
    }
  },
  {
    id: 'DebugOpenBrepDebugger',
    appearance: {
      cssIcons: ['cubes'],
      label: 'open BREP debugger',
      info: 'open the BREP debugger in a window',
    },
    invoke: ({services: {cadScene}}) => {
      // require('../brep/debug/debugger/brepDebugger.less');
      let debuggerWinDom = document.getElementById('brep-debugger');
      if (!debuggerWinDom) {
        //Temporary hack until win infrastructure is done for 3d
        debuggerWinDom = document.createElement('div');
        debuggerWinDom.setAttribute('id', 'brep-debugger');
        debuggerWinDom.innerHTML = '<div class="tool-caption" ><i class="fa fa-fw fa-bug"></i>Brep Debugger</div><div class="content"></div>';
        document.body.appendChild(debuggerWinDom);
        debuggerWinDom.debuggerWin = new ui.Window($(debuggerWinDom), new ui.WinManager());
        let brepDebugGroup = new THREE.Object3D();
        cadScene.auxGroup.add(brepDebugGroup);
      
        ReactDOM.render(
          <BrepDebugger brepDebugGroup={brepDebugGroup}/>,
          debuggerWinDom.getElementsByClassName('content')[0]
        );
      }
      debuggerWinDom.debuggerWin.show();
    }
  }

];
