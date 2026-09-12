'use strict';
// 仅由 Creator scene process 执行，所有序列化交给 Editor。
exports.assembleM0 = async function () {
  const { director, Node, Camera, Canvas, UITransform, Layers, js, assetManager } = require('cc');
  const scene=director.getScene();
  if(!scene||scene.name!=='Main')throw Error('必须先打开 M0 Main Scene');
  const get=(parent,name)=>parent.getChildByName(name)||(()=>{const n=new Node(name);parent.addChild(n);return n;})();
  const root=get(scene,'GameRoot'),board=get(root,'BoardRoot'),units=get(root,'UnitsRoot');
  const camera=scene.getChildByName('Main Camera');if(!camera)throw Error('模板相机缺失');
  const canvas=get(scene,'Canvas');canvas.layer=Layers.Enum.UI_2D;canvas.getComponent(UITransform)||canvas.addComponent(UITransform);const cv=canvas.getComponent(Canvas)||canvas.addComponent(Canvas);
  const uiCamera=get(canvas,'UICamera');uiCamera.layer=Layers.Enum.UI_2D;uiCamera.setPosition(0,0,1000);
  const cam=uiCamera.getComponent(Camera)||uiCamera.addComponent(Camera);cam.projection=Camera.ProjectionType.ORTHO;cam.visibility=Layers.Enum.UI_2D;cam.priority=10;cam.clearFlags=Camera.ClearFlag.DEPTH_ONLY;cam.near=.1;cam.far=2000;cv.cameraComponent=cam;
  const Piece=js.getClassByName('PieceView'),Game=js.getClassByName('M0Game');if(!Piece||!Game)throw Error('自定义脚本尚未导入');
  const url='db://assets/prefabs/Piece.prefab';
  let info=await Editor.Message.request('asset-db','query-asset-info',url);
  if(!info){
    const prototype=new Node('Piece');scene.addChild(prototype);prototype.addComponent(Piece);
    try{await Editor.Message.request('scene','create-prefab',prototype.uuid,url);}finally{prototype.destroy();}
    info=await Editor.Message.request('asset-db','query-asset-info',url);
  }
  if(!info)throw Error('Editor 未生成 Piece Prefab');
  const prefab=await new Promise((resolve,reject)=>assetManager.loadAny({uuid:info.uuid},(e,a)=>e?reject(e):resolve(a)));
  const materialInfo=await Editor.Message.request('asset-db','query-asset-info','db://internal/default_materials/standard-material.mtl');
  const chessMaterial=await new Promise((resolve,reject)=>assetManager.loadAny({uuid:materialInfo.uuid},(e,a)=>e?reject(e):resolve(a)));
  const game=root.getComponent(Game)||root.addComponent(Game);
  Object.assign(game,{boardRoot:board,unitsRoot:units,cameraNode:camera,uiRoot:canvas,piecePrefab:prefab,chessMaterial});
  return {scene:scene.uuid,prefab:info.uuid,root:root.uuid,bindings:['boardRoot','unitsRoot','cameraNode','uiRoot','piecePrefab','chessMaterial']};
};
