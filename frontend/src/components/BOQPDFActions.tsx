/**
 * BOQ PDF Actions Component
 * Provides buttons for downloading and sending BOQ PDFs
 * Replace old PDF export buttons with this component
 */

import React, { useState } from 'react';
import { Button, Dropdown, Modal, Form, Input, Checkbox, Space } from 'antd';
import { DownloadOutlined, MailOutlined, FileTextOutlined } from '@ant-design/icons';
import { useBOQPdf } from '../hooks/useBOQPdf';
import type { MenuProps } from 'antd';

interface BOQPDFActionsProps {
  boqId: number;
  clientEmail?: string;
  projectName?: string;
}

export const BOQPDFActions: React.FC<BOQPDFActionsProps> = ({
  boqId,
  clientEmail = '',
  projectName = '',
}) => {
  const { loading, downloadInternal, downloadClient, sendToClient } = useBOQPdf();
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [form] = Form.useForm();

  // Download menu items
  const downloadMenuItems: MenuProps['items'] = [
    {
      key: 'internal',
      label: 'Internal PDF (Full Breakdown)',
      icon: <FileTextOutlined />,
      onClick: () => downloadInternal(boqId),
    },
    {
      key: 'client',
      label: 'Client PDF (Clean View)',
      icon: <FileTextOutlined />,
      onClick: () => downloadClient(boqId),
    },
  ];

  // Handle send to client
  const handleSendToClient = async (values: any) => {
    const success = await sendToClient(
      boqId,
      values.clientEmail,
      values.message,
      values.formats
    );

    if (success) {
      setEmailModalVisible(false);
      form.resetFields();
    }
  };

  // Open email modal
  const openEmailModal = () => {
    form.setFieldsValue({
      clientEmail: clientEmail,
      message: `Dear Client,\n\nPlease find attached the Bill of Quantities for ${projectName}. Please review and let us know if you have any questions.\n\nBest regards,\nMeterSquare Team`,
      formats: ['excel', 'pdf'],
    });
    setEmailModalVisible(true);
  };

  return (
    <>
      <Space>
        {/* Download Dropdown */}
        <Dropdown menu={{ items: downloadMenuItems }} placement="bottomLeft">
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={loading}
          >
            Download PDF
          </Button>
        </Dropdown>

        {/* Send to Client Button */}
        <Button
          icon={<MailOutlined />}
          onClick={openEmailModal}
          loading={loading}
        >
          Send to Client
        </Button>
      </Space>

      {/* Email Modal */}
      <Modal
        title="Send BOQ to Client"
        open={emailModalVisible}
        onCancel={() => {
          setEmailModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSendToClient}
        >
          <Form.Item
            label="Client Email"
            name="clientEmail"
            rules={[
              { required: true, message: 'Please enter client email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="client@example.com" />
          </Form.Item>

          <Form.Item
            label="Message"
            name="message"
            rules={[{ required: true, message: 'Please enter a message' }]}
          >
            <Input.TextArea rows={6} placeholder="Enter message to client" />
          </Form.Item>

          <Form.Item
            label="Attachment Formats"
            name="formats"
            initialValue={['excel', 'pdf']}
          >
            <Checkbox.Group>
              <Checkbox value="excel">Excel</Checkbox>
              <Checkbox value="pdf">PDF</Checkbox>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                Send Email
              </Button>
              <Button onClick={() => setEmailModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default BOQPDFActions;
