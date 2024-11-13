/**
 * main.ts
 */

import { mat4, vec3 } from "wgpu-matrix";

import {
    cubeVertexArray,
    cubeVertexSize,
    cubeUVOffset,
    cubePositionOffset,
    cubeVertexCount
} from "./cube";

import basicVertWGSL from "./basic.vert.wgsl?raw";
import sampleTextureMixColorWGSL from "./sampleTextureMixColor.frag.wgsl?raw";
// import { quitIfWebGPUNotAvailable } from "util";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
// quitIfWebGPUNotAvailable(adapter, device);

const context = canvas.getContext("webgpu") as GPUCanvasContext;
const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
    device,
    "format": presentationFormat
});

const verticesBuffer = device.createBuffer({
    "size": cubeVertexArray.byteLength,
    "usage": GPUBufferUsage.VERTEX,
    "mappedAtCreation": true
});
new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
verticesBuffer.unmap();

const pipeline = device.createRenderPipeline({
    "layout": "auto",
    "vertex": {
        "module": device.createShaderModule({
            "code": basicVertWGSL
        }),
        "buffers": [
            {
                "arrayStride": cubeVertexSize,
                "attributes": [
                    {
                        "shaderLocation": 0,
                        "offset": cubePositionOffset,
                        "format": "float32x4"
                    }, {
                        "shaderLocation": 1,
                        "offset": cubeUVOffset,
                        "format": "float32x2"
                    }
                ]
            }
        ]
    },
    "fragment": {
        "module": device.createShaderModule({
            "code": sampleTextureMixColorWGSL
        }),
        "targets": [
            {
                "format": presentationFormat
            }
        ]
    },
    "primitive": {
        "topology": "triangle-list",
        "cullMode": "back"
    },
    "depthStencil": {
        "depthWriteEnabled": true,
        "depthCompare": "less",
        "format": "depth24plus"
    }
});

const depthTexture = device.createTexture({
    "size": [canvas.width, canvas.height],
    "format": "depth24plus",
    "usage": GPUTextureUsage.RENDER_ATTACHMENT
});

const uniformBufferSize = 4 * 16;
const uniformBuffer = device.createBuffer({
    "size": uniformBufferSize,
    "usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

let cubeTexture: GPUTexture;
{
    const response = await fetch("/Di-3d.png");
    const imageBitmap = await createImageBitmap(await response.blob());
    cubeTexture = device.createTexture({
        "size": [imageBitmap.width, imageBitmap.height, 1],
        "format": "rgba8unorm",
        "usage":
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture(
        { "source": imageBitmap },
        { "texture": cubeTexture },
        [imageBitmap.width, imageBitmap.height]
    );
}

const sampler = device.createSampler({
    "magFilter": "linear",
    "minFilter": "linear"
});

const uniformBindGroup = device.createBindGroup({
    "layout": pipeline.getBindGroupLayout(0),
    "entries": [
        {
            "binding": 0,
            "resource": {
                "buffer": uniformBuffer
            }
        }, {
            "binding": 1,
            "resource": sampler
        }, {
            "binding": 2,
            "resource": cubeTexture.createView()
        }
    ]
});

const renderPassDescriptor: GPURenderPassDescriptor = {
    "colorAttachments": [
        {
            "view": undefined,
            "clearValue": [0.5, 0.5, 0.5, 1.0],
            "loadOp": "clear",
            "storeOp": "store"
        }
    ],
    "depthStencilAttachment": {
        "view": depthTexture.createView(),
        "depthClearValue": 1.0,
        "depthLoadOp": "clear",
        "depthStoreOp": "store"
    }
};

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
const modelViewProjectionMatrix = mat4.create();

function getTransformationMatrix() {
    const viewMatrix = mat4.identity();
    mat4.translate(viewMatrix, vec3.fromValues(0, 0, -4), viewMatrix);
    const now = Date.now() / 1000;
    mat4.rotate(viewMatrix, vec3.fromValues(Math.sin(now), Math.cos(now), 0), 1, viewMatrix);
    mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);
    return modelViewProjectionMatrix;
}

function frame() {
    const transformationMatrix = getTransformationMatrix();
    device.queue.writeBuffer(uniformBuffer, 0, transformationMatrix.buffer, transformationMatrix.byteOffset, transformationMatrix.byteLength);
    renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.draw(cubeVertexCount);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);