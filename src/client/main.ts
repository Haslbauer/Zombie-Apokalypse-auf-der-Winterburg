import * as THREE from 'three';
import { GameCamera } from './camera';

const container = document.getElementById('game')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc6e0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-10, 25, 10);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x6fae4f }),
);
scene.add(ground);

const cam = new GameCamera(window.innerWidth / window.innerHeight);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.resize(window.innerWidth / window.innerHeight);
});

renderer.setAnimationLoop(() => renderer.render(scene, cam.camera));
