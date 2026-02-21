/**
 * 3D Volleyball Court Scene — Three.js / React Three Fiber
 * Renders game state from refs updated by physics engine.
 * Optimized for mobile: low-poly, minimal shadows, few draw calls.
 */
import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ── Coordinate conversion ──
const GW = 480;
const GGY = 310;
const S = 0.025;

function g2w(gx: number, gy: number): [number, number, number] {
  return [(gx - GW / 2) * S, (GGY - gy) * S, 0];
}

// ── Camera ──
function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 3, 16);
    camera.lookAt(0, 1.2, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

// ── Sand Ground ──
function SandGround() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 16]} />
        <meshStandardMaterial color="#d4a96a" roughness={1} />
      </mesh>
      {/* Court baseline */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[12, 0.03]} />
        <meshBasicMaterial color="white" transparent opacity={0.5} />
      </mesh>
      {[-6, 6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.001, 0]}>
          <planeGeometry args={[0.03, 4]} />
          <meshBasicMaterial color="white" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ── Net ──
function VolleyNet() {
  const H = 2.5;
  return (
    <group>
      <mesh position={[0, H / 2, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, H + 0.15, 8]} />
        <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, H + 0.1, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ccc" metalness={0.5} />
      </mesh>
      <mesh position={[0, H / 2, 0]}>
        <planeGeometry args={[0.5, H, 5, 12]} />
        <meshBasicMaterial color="white" transparent opacity={0.12} wireframe side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, H, 0]}>
        <boxGeometry args={[0.6, 0.05, 0.015]} />
        <meshStandardMaterial color="white" roughness={0.5} />
      </mesh>
      {[-0.28, 0.28].map((x, idx) => (
        <group key={idx} position={[x, H, 0]}>
          {[0, 1, 2, 3].map((j) => (
            <mesh key={j} position={[0, j * 0.05 + 0.025, 0]}>
              <boxGeometry args={[0.02, 0.045, 0.01]} />
              <meshStandardMaterial color={j % 2 === 0 ? "#e63946" : "white"} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ── 3D Player ──
function Player3D({
  pRef,
  faceRight,
  shirt,
  shorts,
  skin,
}: {
  pRef: React.MutableRefObject<any>;
  faceRight: boolean;
  shirt: string;
  shorts: string;
  skin: string;
}) {
  const grp = useRef<THREE.Group>(null!);
  const lLeg = useRef<THREE.Mesh>(null!);
  const rLeg = useRef<THREE.Mesh>(null!);
  const atkArm = useRef<THREE.Group>(null!);

  useFrame(() => {
    const p = pRef.current;
    if (!grp.current || !p) return;
    const [wx, wy] = g2w(p.x, p.y);
    grp.current.position.set(wx, wy, 0);

    const sw = Math.sin(p.legPhase) * 0.4;
    if (lLeg.current) lLeg.current.rotation.x = sw;
    if (rLeg.current) rLeg.current.rotation.x = -sw;

    if (atkArm.current) {
      const target = p.isAttacking
        ? faceRight ? -2.2 : 2.2
        : faceRight ? 0.3 : -0.3;
      atkArm.current.rotation.z += (target - atkArm.current.rotation.z) * 0.25;
    }
  });

  const d = faceRight ? 1 : -1;

  return (
    <group ref={grp}>
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[0.12, 10]} />
        <meshBasicMaterial color="black" transparent opacity={0.15} />
      </mesh>
      {/* Shoes */}
      <mesh position={[-0.04, 0.02, 0]}>
        <boxGeometry args={[0.06, 0.03, 0.04]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0.04, 0.02, 0]}>
        <boxGeometry args={[0.06, 0.03, 0.04]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* Left leg */}
      <mesh ref={lLeg} position={[-0.04, 0.25, 0]} castShadow>
        <capsuleGeometry args={[0.025, 0.35, 3, 6]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* Right leg */}
      <mesh ref={rLeg} position={[0.04, 0.25, 0]} castShadow>
        <capsuleGeometry args={[0.025, 0.35, 3, 6]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* Shorts */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.14, 0.1, 0.08]} />
        <meshStandardMaterial color={shorts} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.35, 3, 6]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      {/* Attack arm */}
      <group ref={atkArm} position={[d * 0.07, 0.88, 0]}>
        <mesh position={[d * 0.05, 0.01, 0]} castShadow>
          <capsuleGeometry args={[0.02, 0.2, 3, 6]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[d * 0.1, 0.03, 0]}>
          <sphereGeometry args={[0.025, 6, 6]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      {/* Relaxed arm */}
      <mesh position={[-d * 0.07, 0.68, 0]} rotation={[0, 0, -d * 0.5]} castShadow>
        <capsuleGeometry args={[0.02, 0.16, 3, 6]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* Hair */}
      <mesh position={[0, 1.06, 0]}>
        <sphereGeometry args={[0.075, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
    </group>
  );
}

// ── 3D Ball ──
function Ball3D({ bRef }: { bRef: React.MutableRefObject<any> }) {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const b = bRef.current;
    if (!mesh.current || !b) return;
    const [wx, wy] = g2w(b.x, b.y);
    mesh.current.position.set(wx, wy, 0);
    mesh.current.rotation.z = b.rotation;
    mesh.current.rotation.x = b.rotation * 0.4;
  });
  return (
    <mesh ref={mesh} castShadow>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshStandardMaterial color="#f5f0d8" roughness={0.6} />
    </mesh>
  );
}

// ── Ball shadow on ground ──
function BallShadow({ bRef }: { bRef: React.MutableRefObject<any> }) {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const b = bRef.current;
    if (!mesh.current || !b) return;
    const [wx] = g2w(b.x, b.y);
    const height = (GGY - b.y) * S;
    const scale = Math.max(0.3, 1 - height / 8);
    mesh.current.position.set(wx, 0.002, 0);
    mesh.current.scale.set(scale, scale, 1);
    (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0.12 * scale;
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.12, 10]} />
      <meshBasicMaterial color="black" transparent opacity={0.1} />
    </mesh>
  );
}

// ── Physics runner ──
function PhysicsRunner({ tick }: { tick: () => void }) {
  useFrame(tick);
  return null;
}

// ── Main Scene ──
interface Props {
  playerRef: React.MutableRefObject<any>;
  aiRef: React.MutableRefObject<any>;
  ballRef: React.MutableRefObject<any>;
  tickPhysics: () => void;
}

export default function Court3DScene({ playerRef, aiRef, ballRef, tickPhysics }: Props) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3, 16], fov: 45, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      style={{ width: "100%", height: "100%" }}
    >
      <CameraRig />
      <color attach="background" args={["#1a4570"]} />
      <fog attach="fog" args={["#2a6a9e", 20, 50]} />

      <ambientLight intensity={0.45} />
      <directionalLight
        position={[6, 10, 8]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-far={25}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={8}
        shadow-camera-bottom={-2}
      />
      <hemisphereLight args={["#87ceeb", "#c89e5f", 0.25]} />

      <SandGround />
      <VolleyNet />
      <Player3D pRef={playerRef} faceRight shirt="#2563eb" shorts="#e8e8e8" skin="#c8956c" />
      <Player3D pRef={aiRef} faceRight={false} shirt="#dc2626" shorts="#1e293b" skin="#8B7355" />
      <Ball3D bRef={ballRef} />
      <BallShadow bRef={ballRef} />
      <PhysicsRunner tick={tickPhysics} />
    </Canvas>
  );
}
