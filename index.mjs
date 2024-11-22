/**
 * index.mjs
 */

const vertexShaderSource = await fetch("./src/basic.v.wgsl").then(response => response.text());
const fragmentShaderSource = await fetch("./src/basic.f.wgsl").then(response => response.text());
const computeShaderSource = await fetch("./src/basic.c.wgsl").then(response => response.text());

const GRID_SIZE = 100;
const UPDATE_INTERVAL_MS = 100;
const WORKGROUP_SIZE = 8;
let ADAPTER_DEVICE = null;
let CANVAS_CONTEXT = null;
let CELL_PIPELINE = null;
let SIMULATION_PIPELINE = null;
let VERTEX_BUFFER = null;
let BIND_GROUPS = null;
let VERTEX_DATA = null;
let STEP = 0;

function updateGrid() {
    const encoder = ADAPTER_DEVICE.createCommandEncoder();

    // encode compute pass
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(SIMULATION_PIPELINE);
    computePass.setBindGroup(0, BIND_GROUPS[STEP % 2]);
    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();
    STEP += 1;

    // encode render pass
    const renderPass = encoder.beginRenderPass({
        "colorAttachments": [{
            "view": CANVAS_CONTEXT.getCurrentTexture().createView(),
            "loadOp": "clear",
            "clearValue": [0.1, 0.2, 0.3, 1.0],
            "storeOp": "store"
        }]
    });
    renderPass.setPipeline(CELL_PIPELINE);
    renderPass.setBindGroup(0, BIND_GROUPS[STEP % 2]);
    renderPass.setVertexBuffer(0, VERTEX_BUFFER);
    renderPass.draw(VERTEX_DATA.length / 2, GRID_SIZE * GRID_SIZE);
    renderPass.end();

    // finalize command encoding
    const commandBuffer = encoder.finish();
    ADAPTER_DEVICE.queue.submit([commandBuffer]);
}

async function main() {
    // assert support, resolve adapter
    if (!window.navigator.gpu) {
        throw new Error("WebGPU not supported");
    }
    const adapter = await window.navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("Unable to acquire WebGPU adapter");
    }
    ADAPTER_DEVICE = await adapter.requestDevice();
    console.log("adapter device acquired:", ADAPTER_DEVICE);

    // identify context
    const canvas = window.document.querySelector("canvas");
    CANVAS_CONTEXT = canvas.getContext("webgpu");
    const canvasFormat = window.navigator.gpu.getPreferredCanvasFormat();
    CANVAS_CONTEXT.configure({
        "device": ADAPTER_DEVICE,
        "format": canvasFormat
    });
    console.log("canvas context acquired:", CANVAS_CONTEXT);

    // define vertex buffer
    VERTEX_DATA = new Float32Array([
        -0.8, -0.8,
        0.8, -0.8,
        0.8, 0.8,

        -0.8, -0.8,
        0.8, 0.8,
        -0.8, 0.8
    ]);
    VERTEX_BUFFER = ADAPTER_DEVICE.createBuffer({
        "label": "Cell vertices",
        "size": VERTEX_DATA.byteLength,
        "usage": GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    ADAPTER_DEVICE.queue.writeBuffer(VERTEX_BUFFER, 0, VERTEX_DATA);
    const vertexBufferLayout = {
        "arrayStride": 8,
        "attributes": [{
            "format": "float32x2",
            "offset": 0,
            "shaderLocation": 0,
        }]
    };
    console.log("vertex buffer populated:", VERTEX_BUFFER);

    // define uniforms buffer
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    const uniformBuffer = ADAPTER_DEVICE.createBuffer({
        "label": "Grid Uniforms",
        "size": uniformArray.byteLength,
        "usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    ADAPTER_DEVICE.queue.writeBuffer(uniformBuffer, 0, uniformArray);
    console.log("uniform buffer populated:", uniformBuffer);

    // define state buffer
    const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
    const cellStateStorage = [
        ADAPTER_DEVICE.createBuffer({
            "label": "Cell State A",
            "size": cellStateArray.byteLength,
            "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        }),
        ADAPTER_DEVICE.createBuffer({
            "label": "Cell State B",
            "size": cellStateArray.byteLength,
            "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        })
    ];
    for (let i = 0; i < cellStateArray.length; i += 1) {
        cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
    }
    ADAPTER_DEVICE.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
    console.log("cell state populated:", cellStateStorage[0]);

    // define/compile shader programs
    const cellShaderModule = ADAPTER_DEVICE.createShaderModule({
        "label": "Cell shader",
        "code": [
            vertexShaderSource,
            fragmentShaderSource
        ].join("\n")
    });
    const simulationShaderModule = ADAPTER_DEVICE.createShaderModule({
        "label": "Game of Life simulation shader",
        "code": [
            computeShaderSource
        ].join("\n")
    });
    console.log("created shader modules:", cellShaderModule, simulationShaderModule);

    // define binding layouts
    const bindGroupLayout = ADAPTER_DEVICE.createBindGroupLayout({
        "label": "Cell Bind Group Layout",
        "entries": [{
            "binding": 0,
            "visibility": GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
            "buffer": {}
        }, {
            "binding": 1,
            "visibility": GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
            "buffer": { "type": "read-only-storage" }
        }, {
            "binding": 2,
            "visibility": GPUShaderStage.COMPUTE,
            "buffer": { "type": "storage" }
        }]
    });
    const pipelineLayout = ADAPTER_DEVICE.createPipelineLayout({
        "label": "Cell Pipeline Layout",
        "bindGroupLayouts": [bindGroupLayout]
    });
    console.log("defined binding layouts:", bindGroupLayout);

    // pipelines := program + buffers
    CELL_PIPELINE = ADAPTER_DEVICE.createRenderPipeline({
        "label": "Cell pipeline",
        "layout": pipelineLayout,
        "vertex": {
            "module": cellShaderModule,
            "entryPoint": "vertexMain",
            "buffers": [vertexBufferLayout]
        },
        "fragment": {
            "module": cellShaderModule,
            "entryPoint": "fragmentMain",
            "targets": [{
                "format": canvasFormat
            }]
        }
    });
    SIMULATION_PIPELINE = ADAPTER_DEVICE.createComputePipeline({
        "label": "Simulation pipeline",
        "layout": pipelineLayout,
        "compute": {
            "module": simulationShaderModule,
            "entryPoint": "computeMain"
        }
    });
    console.log("pipelines generated:", CELL_PIPELINE, SIMULATION_PIPELINE);

    // define pipeline bindings
    BIND_GROUPS = [
        ADAPTER_DEVICE.createBindGroup({
            "label": "Cell renderer bind group A",
            "layout": bindGroupLayout,
            "entries": [{
                "binding": 0,
                "resource": { "buffer": uniformBuffer }
            }, {
                "binding": 1,
                "resource": { "buffer": cellStateStorage[0] }
            }, {
                "binding": 2,
                "resource": { "buffer": cellStateStorage[1] }
            }]
        }),
        ADAPTER_DEVICE.createBindGroup({
            "label": "Cell renderer bind group B",
            "layout": bindGroupLayout,
            "entries": [{
                "binding": 0,
                "resource": { "buffer": uniformBuffer }
            }, {
                "binding": 1,
                "resource": { "buffer": cellStateStorage[1] }
            }, {
                "binding": 2,
                "resource": { "buffer": cellStateStorage[0] }
            }]
        })
    ];
    console.info("binding groups defined:", BIND_GROUPS[0], BIND_GROUPS[1]);

    // finally, launch the main loop
    setInterval(updateGrid, UPDATE_INTERVAL_MS);
}

// window.addEventListener("load", main);
main();
