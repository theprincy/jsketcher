import {MObject} from "cad/model/mobject";
import {Shell} from "brep/topo/shell";
import {MFace} from "cad/model/mface";
import {Face} from "brep/topo/face";
import {FaceRef} from "cad/craft/e0/OCCUtils";
import {Classification, Classifier, OCCClassifier} from "cad/craft/production/classifier";
import {addToListInMap} from "gems/iterables";
import {MEdge} from "cad/model/medge";
import {Edge} from "brep/topo/edge";
import {MBrepShell} from "cad/model/mshell";

const classifier: Classifier = new OCCClassifier();

type ObjectRef = [string, number];

interface OneToManyRelation {
  source: ObjectRef;
  targets: ObjectRef[];
}

interface ProductionHistory {

  generated: OneToManyRelation[];

  modified: OneToManyRelation[];

}

enum GenClassification {
  EDGE_TO_FACE,
  VERTEX_TO_EDGE,
  FACE_x_FACE_TO_EDGE,
  EDGE_x_EDGE_TO_VERTEX
}



class ID {

  type: string;

  generated: string[] = [];

  modified: string[] = [];

  constructor(type) {
    this.type = type;
  }

  addGenerated(sourceType: string, sourceId: string) {
    this.generated.push(sourceId);
  }

  addModified(sourceType: string, sourceId: string) {
    this.modified.push(sourceId);
  }

  render() {
    if (this.generated.length > 0) {
      if (this.generated.length === 1) {
        return this.type[0] + ":" + this.generated[0];
      } else if (this.generated.length > 1) {
        return this.type[0] + ':[' + this.generated.sort().join('x') + ']';
      }
    } else {

      if (this.modified.length === 1) {
        return this.modified[0];
      } else if (this.modified.length > 1) {
        return this.type[0] + ':[' + this.modified.sort().join('|') + ']';
      }
    }
    throw 'illegal state';
  }
}

export interface ProductionAnalyzer {
  assignIdentification(createdShell: Shell);
}

export class FromSketchProductionAnalyzer implements ProductionAnalyzer {

  profiles: FaceRef[];

  constructor(profiles: FaceRef[]) {
    this.profiles = profiles;
    for (let originFace of this.profiles) {
      classifier.prepare(originFace.topoShape);
    }
  }

  assignIdentification(createdShell: Shell) {

    classifier.prepare(createdShell);

    for (let originFace of this.profiles) {
      const originFaceTopology = originFace.topoShape.faces[0];
      let base: Face = null;
      let wireId = originFace.contour.id;

      for (let createdFace of createdShell.faces) {

        classifier.prepare(originFace.topoShape);
        let faceToFaceClassification = classifier.classifyFaceToFace(originFaceTopology, createdFace);

        if (faceToFaceClassification === Classification.SAME) {
          base = createdFace;
          base.data.id = `F:BASE[${wireId}]`;
          base.data.productionInfo = {
            role: 'base',
            originatingWire: wireId
          }
          break;
        }
      }

      for (let i = 0; i < originFace.edges.length; ++i) {
        const profileEdge = originFaceTopology.outerLoop.halfEdges[i].edge;
        const seg = originFace.contour.segments[i];

        for (let createdEdge of createdShell.edges) {

          if (classifier.classifyEdgeToEdge(profileEdge, createdEdge) !== Classification.UNRELATED) {
            createdEdge.data.id = `E:BASE[${seg.id}]`;
            createdEdge.data.productionInfo = {
              role: 'base',
              originatingPrimitive: seg.id
            }
            let halfEdge = createdEdge.getHalfEdge(he => he?.loop?.face && he.loop.face !== base);
            if (halfEdge) {
              let face = halfEdge.loop.face;
              face.data.id = `F:SWEEP[${seg.id}]`;
              face.data.productionInfo = {
                role: 'sweep',
                originatingPrimitive: seg.id
              }

              halfEdge.prev.edge.data.id = `E:SWEEP[${seg.id}/A]`;
              halfEdge.prev.edge.data.productionInfo = {
                role: 'sweep',
                originatingPrimitive: seg.id + '/A'
              }

              halfEdge.prev.vertexA.data.id = `V:LID[${seg.id}/A]`
              halfEdge.prev.vertexA.data.productionInfo = {
                role: 'lid',
                originatingPrimitive: seg.id + '/A'
              }

              halfEdge.prev.vertexB.data.id = `V:BASE[${seg.id}/A]`
              halfEdge.prev.vertexB.data.productionInfo = {
                role: 'base',
                originatingPrimitive: seg.id + '/A'
              }

              //Extruded not closed wire
              if (!halfEdge.next.twin()) {
                halfEdge.next.edge.data.id = `E:SWEEP[${seg.id}/B]`;
                halfEdge.next.edge.data.productionInfo = {
                  role: 'sweep',
                  originatingPrimitive: seg.id + '/B'
                }

                halfEdge.next.vertexA.data.id = `V:BASE[${seg.id}/B]`
                halfEdge.next.vertexA.data.productionInfo = {
                  role: 'base',
                  originatingPrimitive: seg.id + '/B'
                }

                halfEdge.prev.vertexB.data.id = `V:LID[${seg.id}/B]`
                halfEdge.prev.vertexB.data.productionInfo = {
                  role: 'lid',
                  originatingPrimitive: seg.id + '/B'
                }
              }
            }
          }
        }
      }

      for (let createdFace of createdShell.faces) {
        if (!createdFace.data.productionInfo) {
          createdFace.data.id = `F:LID[${wireId}]`;
          createdFace.data.productionInfo = {
            role: 'lid'
          }
          break;
        }
      }

      for (let createdEdge of createdShell.edges) {
        if (!createdEdge.data.productionInfo) {

          const he = createdEdge.getHalfEdge(he => he?.loop?.face?.data?.productionInfo?.role === 'sweep');
          if (!he) {
            debugger;
          }
          if (he) {
            const originatingPrimitive = he.loop.face.data.productionInfo.originatingPrimitive;
            createdEdge.data.id = `E:LID[${originatingPrimitive}]`;
            createdEdge.data.productionInfo = {
              role: 'lid',
              originatingPrimitive
            }
          }
        }
      }
    }
  }
}



const SPATIAL_COMPARATOR = (a: Face, b: Face) => {


};

function spatialSort(faces: Face[]) {

}

function spatialEdgeSort(edges: Edge[]) {

}


function spatialMSort(faces: MFace[]) {

}

function spatialMEdgeSort(edges: MEdge[]) {

}


function forceAdvance(idToAssign: string): string {
  const match = idToAssign.match(/(.+)\/\$(\d+)$/);
  if (match) {
    return match[1] + '/$' + (parseInt(match[2]) + 1);
  } else {
    return idToAssign + '/$1';
  }
}

export class FromMObjectProductionAnalyzer implements ProductionAnalyzer {

  consumed: MObject[] = [];
  mustAdvance: Set<string>;

  constructor(consumed: MObject[], mustAdvance: MObject[] = []) {
    this.consumed = consumed;
    this.mustAdvance = new Set<string>(mustAdvance&&mustAdvance.map(o => o.id));
    consumed.forEach(mShell => {
      if (mShell instanceof MBrepShell) {
        classifier.prepare(mShell.brepShell);
      }
    });

  }

  assignIdentification(createdShell: Shell) {

    classifier.prepare(createdShell);

    const faceIds = new Map<string, Face[]>();
    const edgeIds = new Map<string, Edge[]>();
    const notIdentifiedEdges = new Set<Edge>();

    function assignFaceId(id: string, face: Face) {
      addToListInMap(edgeIds, id, face);
    }

    function assignEdgeId(id: string, edge: Edge) {
      addToListInMap(edgeIds, id, edge);
    }

    for (let createdFace of createdShell.faces) {
      const fuse: MFace[] = [];
      this.consumed.forEach(consumedShell => {

        consumedShell.traverse(consumedObj => {
          if (consumedObj instanceof MFace) {
            const consumedFace = consumedObj;
            if (!consumedFace.brepFace) {
              return;
            }
            let ffClassification = classifier.classifyFaceToFace(createdFace, consumedFace.brepFace);
            if (ffClassification !== Classification.UNRELATED) {
              fuse.push(consumedFace);
            } else {
              ffClassification = classifier.classifyFaceToFace(consumedFace.brepFace, createdFace);
              if (ffClassification !== Classification.UNRELATED) {
                fuse.push(consumedFace);
              }
            }
          }
        });
      })
      if (fuse.length == 1) {
        createdFace.data.productionInfo = fuse[0].brepFace.data.productionInfo;
        let idToAssign = fuse[0].id;
        if (this.mustAdvance.has(idToAssign)) {
          idToAssign = forceAdvance(idToAssign);
        }
        assignFaceId(idToAssign, createdFace);
      } else if (fuse.length > 1) {
        spatialMSort(fuse);
        const fuseId = '[' + fuse.map(f => f.id).join('|') + ']';
        fuse.reverse();
        const fusedProdInfo = fuse.reduce((accum, face) => {
          return Object.assign(accum, face.brepFace.data.productionInfo);
        }, {});
        createdFace.data.productionInfo = fusedProdInfo;
        assignFaceId(fuseId, createdFace);
      }
    }

    for (let [id, newFaces] of faceIds) {
      if (newFaces.length > 1) {
        spatialSort(newFaces);
        newFaces.forEach((newFace, i) => {
          newFace.data.id = `${id}:${i}`;
        });
      } else if (newFaces.length === 1) {
        newFaces[0].data.id = id;
      }
    }

    for (let createdEdge of createdShell.edges) {
      const fuse: MEdge[] = [];
      this.consumed.forEach(consumedShell => {
        consumedShell.traverse(consumedObj => {
          if (consumedObj instanceof MEdge) {
            const consumedEdge = consumedObj;
            let eeClassification = classifier.classifyEdgeToEdge(createdEdge, consumedEdge.brepEdge);
            if (eeClassification !== Classification.UNRELATED) {
              fuse.push(consumedEdge);
            }
          }
        });
      });
      if (fuse.length === 1) {
        createdEdge.data.productionInfo = fuse[0].brepEdge.data.productionInfo;
        let idToAssign = fuse[0].id;
        assignEdgeId(idToAssign, createdEdge);
      } else if (fuse.length > 1) {
        spatialMEdgeSort(fuse);
        const fuseId = '[' + fuse.map(f => f.id).join('|') + ']';
        fuse.reverse();
        const fusedProdInfo = fuse.reduce((accum, face) => {
          return Object.assign(accum, face.brepEdge.data.productionInfo);
        }, {});
        createdEdge.data.productionInfo = fusedProdInfo;
        assignEdgeId(fuseId, createdEdge);
      } else {
        notIdentifiedEdges.add(createdEdge)
      }
    }

    for (let [id, newEdges] of edgeIds) {
      if (newEdges.length > 1) {
        spatialEdgeSort(newEdges);
        newEdges.forEach((newFace, i) => {
          newFace.data.id = `${id}:${i}`;
        });
      } else if (newEdges.length === 1) {
        newEdges[0].data.id = id;
      }
    }

    const newEdges = new Map<string, Edge[]>();
    notIdentifiedEdges.forEach(edge => {

      // let edgeCreators = new Map<Edge, MFace[]>();
      let edgeCreators = [];
      this.consumed.forEach(consumedShell => {
        consumedShell.traverse(consumedObj => {
          if (consumedObj instanceof MFace && consumedObj.brepFace) {
            if (classifier.classifyEdgeToFace(edge, consumedObj.brepFace) !== Classification.UNRELATED) {
              edgeCreators.push(consumedObj);

            }
          }
        });
      });
      const edgeCreatorIds = edgeCreators.map(f => f.id).sort();
      const id = '[' + edgeCreatorIds.join('|') + ']';
      addToListInMap(newEdges, id, edge);
      edge.data.productionInfo = {
        role: 'intersection',
        parents: edgeCreatorIds
      };
      edge.data.id = id;
    });

    for (let [id, newEdges] of edgeIds) {
      if (newEdges.length > 1) {
        spatialEdgeSort(newEdges);
        newEdges.forEach((newFace, i) => {
          newFace.data.id = `${id}:${i}`;
        });
      } else if (newEdges.length === 1) {
        newEdges[0].data.id = id;
      }
    }


  }
}